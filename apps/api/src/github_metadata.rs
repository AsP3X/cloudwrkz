//! Background queue + GitHub REST enrichment for link metadata (rate-limited server-side).

use std::time::{Duration, Instant};

use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::{error, info, warn};
use url::Url;

use crate::id::new_cuid;

const GITHUB_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_UA: &str = "Cloudwrkz-API (link metadata enrichment; public repos only)";

fn parse_github_owner_repo(raw_url: &str) -> Option<(String, String)> {
    let trimmed = raw_url.trim();
    let with_proto = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let u = url::Url::parse(&with_proto).ok()?;
    if !u.host_str()?.eq_ignore_ascii_case("github.com") {
        return None;
    }
    let mut segs = u.path_segments()?.peekable();
    let owner = segs.next()?.to_string();
    let repo = segs.next()?.trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

fn parse_last_page_from_link_header(link_header: Option<&str>) -> Option<i64> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r#"[?&]page=(\d+)>;\s*rel="last""#).expect("regex"));
    let h = link_header?;
    let cap = re.captures(h)?;
    cap.get(1)?.as_str().parse().ok()
}

async fn github_throttle_wait(last_request_at: &mut Option<Instant>, min_interval: Duration) {
    if let Some(prev) = *last_request_at {
        let elapsed = prev.elapsed();
        if elapsed < min_interval {
            tokio::time::sleep(min_interval - elapsed).await;
        }
    }
}

async fn github_get(
    client: &Client,
    url: &str,
    last_request_at: &mut Option<Instant>,
    min_interval: Duration,
) -> Result<reqwest::Response, String> {
    github_throttle_wait(last_request_at, min_interval).await;
    let res = client
        .get(url)
        .header(reqwest::header::ACCEPT, GITHUB_ACCEPT)
        .header(reqwest::header::USER_AGENT, GITHUB_UA)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    *last_request_at = Some(Instant::now());
    Ok(res)
}

fn merge_github_metadata(existing: Option<Value>, mut github_fields: Value) -> Value {
    let mut base = match existing {
        Some(Value::Object(o)) => Value::Object(o),
        _ => json!({}),
    };
    let base_obj = base.as_object_mut().expect("object");
    if let Some(g) = github_fields.as_object_mut() {
        let keys: Vec<String> = g
            .keys()
            .filter(|k| k.starts_with("github"))
            .cloned()
            .collect();
        for k in keys {
            if let Some(v) = g.remove(&k) {
                base_obj.insert(k, v);
            }
        }
    }
    base
}

fn repo_api_url(owner: &str, repo: &str) -> String {
    format!("https://api.github.com/repos/{owner}/{repo}")
}

async fn fetch_github_enrichment(
    client: &Client,
    owner: &str,
    repo: &str,
    min_interval: Duration,
    last_request_at: &mut Option<Instant>,
) -> Result<Value, String> {
    let repo_api = repo_api_url(owner, repo);

    let repo_res = github_get(client, &repo_api, last_request_at, min_interval).await?;
    if !repo_res.status().is_success() {
        return Err(format!(
            "GitHub repo API returned {}",
            repo_res.status()
        ));
    }
    let repo_json: Value = repo_res.json().await.map_err(|e| e.to_string())?;

    let mut out = json!({});

    if let Some(login) = repo_json.get("owner").and_then(|o| o.get("login")).and_then(|x| x.as_str()) {
        out["githubOwner"] = json!(login);
    } else {
        out["githubOwner"] = json!(owner);
    }
    if let Some(name) = repo_json.get("name").and_then(|x| x.as_str()) {
        out["githubRepo"] = json!(name);
    } else {
        out["githubRepo"] = json!(repo);
    }
    if let Some(b) = repo_json.get("default_branch").and_then(|x| x.as_str()) {
        out["githubDefaultBranch"] = json!(b);
    }
    if let Some(n) = repo_json.get("stargazers_count").and_then(|x| x.as_i64()) {
        out["githubStars"] = json!(n);
    }
    if let Some(n) = repo_json.get("forks_count").and_then(|x| x.as_i64()) {
        out["githubForks"] = json!(n);
    }
    if let Some(n) = repo_json.get("open_issues_count").and_then(|x| x.as_i64()) {
        out["githubOpenIssues"] = json!(n);
    }
    if let Some(n) = repo_json.get("subscribers_count").and_then(|x| x.as_i64()) {
        out["githubWatchers"] = json!(n);
    } else if let Some(n) = repo_json.get("watchers_count").and_then(|x| x.as_i64()) {
        out["githubWatchers"] = json!(n);
    }
    if let Some(f) = repo_json.get("fork").and_then(|x| x.as_bool()) {
        out["githubIsFork"] = json!(f);
    }
    if let Some(lic) = repo_json.get("license") {
        let spdx = lic.get("spdx_id").and_then(|x| x.as_str());
        let name = lic.get("name").and_then(|x| x.as_str());
        if let Some(s) = spdx.filter(|s| !s.is_empty()).or(name) {
            out["githubLicense"] = json!(s);
        }
    }
    if let Some(lang) = repo_json.get("language").and_then(|x| x.as_str()) {
        out["githubPrimaryLanguage"] = json!(lang);
    }
    if let Some(topics) = repo_json.get("topics").and_then(|x| x.as_array()) {
        let t: Vec<&str> = topics.iter().filter_map(|v| v.as_str()).collect();
        if !t.is_empty() {
            out["githubTopics"] = json!(t);
        }
    }
    if let Some(pushed) = repo_json.get("pushed_at").and_then(|x| x.as_str()) {
        out["githubLastPushedAt"] = json!(pushed);
    }

    let branches_url = format!("{repo_api}/branches?per_page=10");
    let br_res = github_get(client, &branches_url, last_request_at, min_interval).await?;
    if br_res.status().is_success() {
        let branches_json: Value = br_res.json().await.unwrap_or(json!([]));
        if let Some(arr) = branches_json.as_array() {
            let names: Vec<String> = arr
                .iter()
                .filter_map(|b| b.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect();
            if !names.is_empty() {
                out["githubBranches"] = json!(names);
            }
        }
    }

    let br1_url = format!("{repo_api}/branches?per_page=1");
    let br1_res = github_get(client, &br1_url, last_request_at, min_interval).await?;
    if br1_res.status().is_success() {
        if let Some(last) = parse_last_page_from_link_header(br1_res.headers().get("link").and_then(|h| h.to_str().ok()))
        {
            out["githubBranchesCount"] = json!(last);
        } else {
            let arr: Value = br1_res.json().await.unwrap_or(json!([]));
            if let Some(a) = arr.as_array() {
                out["githubBranchesCount"] = json!(a.len() as i64);
            }
        }
    }

    let rel_url = format!("{repo_api}/releases?per_page=1");
    let rel_res = github_get(client, &rel_url, last_request_at, min_interval).await?;
    if rel_res.status().is_success() {
        if let Some(last) =
            parse_last_page_from_link_header(rel_res.headers().get("link").and_then(|h| h.to_str().ok()))
        {
            out["githubReleasesCount"] = json!(last);
        } else {
            let arr: Value = rel_res.json().await.unwrap_or(json!([]));
            if let Some(a) = arr.as_array() {
                out["githubReleasesCount"] = json!(a.len() as i64);
            }
        }
    }

    let default_branch = repo_json
        .get("default_branch")
        .and_then(|x| x.as_str())
        .unwrap_or("main");
    let commits_url = Url::parse(&format!("{repo_api}/commits"))
        .map(|mut u| {
            u.query_pairs_mut()
                .append_pair("per_page", "1")
                .append_pair("sha", default_branch);
            u.to_string()
        })
        .unwrap_or_else(|_| format!("{repo_api}/commits?per_page=1&sha={default_branch}"));
    let com_res = github_get(client, &commits_url, last_request_at, min_interval).await?;
    if com_res.status().is_success() {
        if let Some(last) =
            parse_last_page_from_link_header(com_res.headers().get("link").and_then(|h| h.to_str().ok()))
        {
            out["githubCommitsCount"] = json!(last);
        }
    }

    Ok(out)
}

async fn mark_job_failed(pool: &PgPool, job_id: &str, msg: &str) {
    let _ = sqlx::query(
        "UPDATE link_github_metadata_jobs SET status = 'failed', error_message = $2, updated_at = NOW(), completed_at = NOW() WHERE id = $1",
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

async fn process_one_job(pool: &PgPool, client: &Client, min_interval: Duration) -> bool {
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            warn!(event = "github_metadata.tx_begin", error = %e, "failed to begin job transaction");
            return false;
        }
    };

    let job_row = sqlx::query(
        r#"
        WITH cte AS (
          SELECT id FROM link_github_metadata_jobs
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE link_github_metadata_jobs j
        SET status = 'processing', updated_at = NOW()
        FROM cte
        WHERE j.id = cte.id
        RETURNING j.id, j.link_id
        "#,
    )
    .fetch_optional(&mut *tx)
    .await;

    let job_row = match job_row {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            warn!(event = "github_metadata.dequeue", error = %e, "dequeue query failed");
            return false;
        }
    };

    let Some(job_row) = job_row else {
        let _ = tx.commit().await;
        return false;
    };

    let job_id: String = job_row.get("id");
    let link_id: String = job_row.get("link_id");

    let link_row = sqlx::query("SELECT url, metadata FROM links WHERE id = $1 FOR UPDATE")
        .bind(&link_id)
        .fetch_optional(&mut *tx)
        .await;

    let link_row = match link_row {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            error!(event = "github_metadata.link_load", job_id = %job_id, error = %e, "load link failed");
            return true;
        }
    };

    let Some(link_row) = link_row else {
        let _ = sqlx::query(
            "UPDATE link_github_metadata_jobs SET status = 'failed', error_message = $2, updated_at = NOW(), completed_at = NOW() WHERE id = $1",
        )
        .bind(&job_id)
        .bind("Link was deleted before the job ran.")
        .execute(&mut *tx)
        .await;
        let _ = tx.commit().await;
        return true;
    };

    let url: String = link_row.get("url");
    let existing_meta: Option<Value> = link_row.get("metadata");

    if parse_github_owner_repo(&url).is_none() {
        let _ = sqlx::query(
            "UPDATE link_github_metadata_jobs SET status = 'failed', error_message = $2, updated_at = NOW(), completed_at = NOW() WHERE id = $1",
        )
        .bind(&job_id)
        .bind("URL is not a GitHub repository.")
        .execute(&mut *tx)
        .await;
        let _ = tx.commit().await;
        return true;
    }

    if tx.commit().await.is_err() {
        return true;
    }

    let (owner, repo) = parse_github_owner_repo(&url).unwrap();
    let mut last_req: Option<Instant> = None;
    let enrichment = match fetch_github_enrichment(client, &owner, &repo, min_interval, &mut last_req).await {
        Ok(v) => v,
        Err(e) => {
            mark_job_failed(pool, &job_id, &e).await;
            info!(event = "github_metadata.job_failed", job_id = %job_id, error = %e, "enrichment failed");
            return true;
        }
    };

    let merged = merge_github_metadata(existing_meta, enrichment);

    let mut tx2 = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            error!(event = "github_metadata.tx2", error = %e, "begin failed");
            mark_job_failed(pool, &job_id, "Database error saving metadata.").await;
            return true;
        }
    };

    let update = sqlx::query(
        r#"UPDATE links SET metadata = $1, metadata_extracted_at = NOW(), updated_at = NOW() WHERE id = $2"#,
    )
    .bind(sqlx::types::Json(merged))
    .bind(&link_id)
    .execute(&mut *tx2)
    .await;

    if let Err(e) = update {
        let _ = tx2.rollback().await;
        mark_job_failed(pool, &job_id, &format!("Failed to save metadata: {e}")).await;
        return true;
    }

    let _ = sqlx::query(
        "UPDATE link_github_metadata_jobs SET status = 'completed', updated_at = NOW(), completed_at = NOW(), error_message = NULL WHERE id = $1",
    )
    .bind(&job_id)
    .execute(&mut *tx2)
    .await;

    if tx2.commit().await.is_ok() {
        info!(event = "github_metadata.job_ok", job_id = %job_id, link_id = %link_id, "GitHub metadata saved");
    }
    true
}

/// Runs forever: dequeues pending jobs and calls GitHub at most once per `min_interval` between requests.
pub fn spawn_github_metadata_worker(pool: PgPool, min_interval_secs: u64) {
    let min_interval = Duration::from_secs(min_interval_secs.max(1));
    tokio::spawn(async move {
        let client = match Client::builder().timeout(Duration::from_secs(45)).build() {
            Ok(c) => c,
            Err(e) => {
                error!(event = "github_metadata.client", error = %e, "reqwest client build failed; worker not running");
                return;
            }
        };

        info!(
            event = "github_metadata.worker_start",
            min_interval_secs,
            "GitHub metadata worker started"
        );

        loop {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let _ = process_one_job(&pool, &client, min_interval).await;
        }
    });
}

/// Enqueue a job if none pending/processing for this link. Returns (job_id, already_queued).
pub async fn enqueue_github_metadata_job(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<(String, bool), sqlx::Error> {
    let pending: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM link_github_metadata_jobs
           WHERE link_id = $1 AND status IN ('pending', 'processing')
           ORDER BY created_at ASC LIMIT 1"#,
    )
    .bind(link_id)
    .fetch_optional(pool)
    .await?;

    if let Some(existing_id) = pending {
        return Ok((existing_id, true));
    }

    let id = new_cuid();
    sqlx::query(
        r#"INSERT INTO link_github_metadata_jobs (id, link_id, user_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'pending', NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(link_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok((id, false))
}
