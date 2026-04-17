//! GitHub REST enrichment for link metadata (`github_link_metadata` jobs).
//! Rate limits are enforced by [`crate::github_rate_limit::GithubRestRateLimit`]; see `docs/background-jobs-and-github.md`.

use std::sync::Arc;

use regex::Regex;
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use tracing::info;
use url::Url;

use crate::github_rate_limit::GithubRestRateLimit;

const GITHUB_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_UA: &str = "Cloudwrkz-API (link metadata enrichment; public repos only)";

pub(crate) fn parse_github_owner_repo(raw_url: &str) -> Option<(String, String)> {
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

/// True when `metadata` already includes GitHub REST enrichment for the same `owner/repo` as `url`.
pub(crate) fn link_github_enrichment_matches_repo(metadata: &Option<Value>, url: &str) -> bool {
    let Some((url_owner, url_repo)) = parse_github_owner_repo(url) else {
        return false;
    };
    let Some(Value::Object(obj)) = metadata.as_ref() else {
        return false;
    };
    let owner_ok = obj
        .get("githubOwner")
        .and_then(|v| v.as_str())
        .is_some_and(|s| s.eq_ignore_ascii_case(&url_owner));
    let repo_ok = obj
        .get("githubRepo")
        .and_then(|v| v.as_str())
        .is_some_and(|s| s.eq_ignore_ascii_case(&url_repo));
    owner_ok && repo_ok
}

fn parse_last_page_from_link_header(link_header: Option<&str>) -> Option<i64> {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r#"[?&]page=(\d+)>;\s*rel="last""#).expect("regex"));
    let h = link_header?;
    let cap = re.captures(h)?;
    cap.get(1)?.as_str().parse().ok()
}

async fn github_get(
    client: &Client,
    url: &str,
    rate: &Arc<GithubRestRateLimit>,
) -> Result<reqwest::Response, String> {
    rate.acquire(1).await;
    let req = client
        .get(url)
        .header(reqwest::header::ACCEPT, GITHUB_ACCEPT)
        .header(reqwest::header::USER_AGENT, GITHUB_UA);
    rate.apply_auth(req).send().await.map_err(|e| e.to_string())
}

/// Two parallel GETs after reserving two slots in the anonymous hourly window.
async fn github_get_parallel_pair(
    client: &Client,
    url_a: &str,
    url_b: &str,
    rate: &Arc<GithubRestRateLimit>,
) -> Result<(reqwest::Response, reqwest::Response), String> {
    rate.acquire(2).await;
    let (ra, rb) = tokio::join!(
        rate.apply_auth(
            client
                .get(url_a)
                .header(reqwest::header::ACCEPT, GITHUB_ACCEPT)
                .header(reqwest::header::USER_AGENT, GITHUB_UA),
        )
        .send(),
        rate.apply_auth(
            client
                .get(url_b)
                .header(reqwest::header::ACCEPT, GITHUB_ACCEPT)
                .header(reqwest::header::USER_AGENT, GITHUB_UA),
        )
        .send(),
    );
    let ra = ra.map_err(|e| e.to_string())?;
    let rb = rb.map_err(|e| e.to_string())?;
    Ok((ra, rb))
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

/// List branches (up to `BRANCH_LIST_PER_PAGE` names) and total branch count using at most two requests.
const BRANCH_LIST_PER_PAGE: i64 = 100;

async fn fetch_branches_metadata(
    client: &Client,
    repo_api: &str,
    rate: &Arc<GithubRestRateLimit>,
) -> Result<(Option<Value>, Option<Value>), String> {
    let url1 = format!("{repo_api}/branches?per_page={BRANCH_LIST_PER_PAGE}");
    let br_res = github_get(client, &url1, rate).await?;
    if !br_res.status().is_success() {
        return Ok((None, None));
    }
    let link = br_res
        .headers()
        .get("link")
        .and_then(|h| h.to_str().ok())
        .map(str::to_owned);
    let branches_json: Value = br_res.json().await.unwrap_or(json!([]));

    let names: Vec<String> = branches_json
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|b| b.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let last_page = parse_last_page_from_link_header(link.as_deref());

    let count = match last_page {
        None | Some(1) => {
            let n = names.len() as i64;
            (n > 0).then_some(n)
        }
        Some(lp) if lp > 1 => {
            let url2 = format!("{repo_api}/branches?per_page={BRANCH_LIST_PER_PAGE}&page={lp}");
            let br2 = github_get(client, &url2, rate).await?;
            if !br2.status().is_success() {
                None
            } else {
                let arr2: Value = br2.json().await.unwrap_or(json!([]));
                let last_len = arr2.as_array().map(|a| a.len() as i64).unwrap_or(0);
                Some((lp - 1) * BRANCH_LIST_PER_PAGE + last_len)
            }
        }
        _ => None,
    };

    let names_json = (!names.is_empty()).then(|| json!(names));
    let count_json = count.map(|n| json!(n));
    Ok((names_json, count_json))
}

async fn fetch_github_enrichment(
    client: &Client,
    owner: &str,
    repo: &str,
    rate: &Arc<GithubRestRateLimit>,
) -> Result<Value, String> {
    let repo_api = repo_api_url(owner, repo);

    let repo_res = github_get(client, &repo_api, rate).await?;
    if !repo_res.status().is_success() {
        return Err(format!("GitHub repo API returned {}", repo_res.status()));
    }
    let repo_json: Value = repo_res.json().await.map_err(|e| e.to_string())?;

    let mut out = json!({});

    if let Some(login) = repo_json
        .get("owner")
        .and_then(|o| o.get("login"))
        .and_then(|x| x.as_str())
    {
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

    let (branch_names, branch_count) = fetch_branches_metadata(client, &repo_api, rate).await?;
    if let Some(v) = branch_names {
        out["githubBranches"] = v;
    }
    if let Some(v) = branch_count {
        out["githubBranchesCount"] = v;
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
    let rel_url = format!("{repo_api}/releases?per_page=1");

    let (rel_res, com_res) = github_get_parallel_pair(client, &rel_url, &commits_url, rate).await?;

    if rel_res.status().is_success() {
        if let Some(last) = parse_last_page_from_link_header(
            rel_res.headers().get("link").and_then(|h| h.to_str().ok()),
        ) {
            out["githubReleasesCount"] = json!(last);
        } else {
            let arr: Value = rel_res.json().await.unwrap_or(json!([]));
            if let Some(a) = arr.as_array() {
                out["githubReleasesCount"] = json!(a.len() as i64);
            }
        }
    }

    if com_res.status().is_success() {
        if let Some(last) = parse_last_page_from_link_header(
            com_res.headers().get("link").and_then(|h| h.to_str().ok()),
        ) {
            out["githubCommitsCount"] = json!(last);
        }
    }

    Ok(out)
}

async fn mark_background_job_failed(pool: &PgPool, job_id: &str, msg: &str) {
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

/// Runs GitHub enrichment for `link_id` and updates `links` + `background_jobs` (`job_id`).
pub async fn execute_github_link_metadata_job(
    pool: &PgPool,
    client: &Client,
    rate: &Arc<GithubRestRateLimit>,
    job_id: &str,
    link_id: &str,
) -> Result<(), String> {
    let link_row = sqlx::query("SELECT url, metadata FROM links WHERE id = $1")
        .bind(link_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    let Some(link_row) = link_row else {
        mark_background_job_failed(pool, job_id, "Link was deleted before the job ran.").await;
        return Err("link missing".into());
    };

    let url: String = link_row.get("url");
    let existing_meta: Option<Value> = link_row.get("metadata");

    if parse_github_owner_repo(&url).is_none() {
        mark_background_job_failed(pool, job_id, "URL is not a GitHub repository.").await;
        return Err("not github".into());
    }

    let (owner, repo) = parse_github_owner_repo(&url).unwrap();
    let enrichment = match fetch_github_enrichment(client, &owner, &repo, rate).await {
        Ok(v) => v,
        Err(e) => {
            mark_background_job_failed(pool, job_id, &e).await;
            info!(event = "github_metadata.job_failed", job_id = %job_id, error = %e, "enrichment failed");
            return Err(e);
        }
    };

    let merged = merge_github_metadata(existing_meta, enrichment);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let update = sqlx::query(
        r#"UPDATE links SET metadata = $1, metadata_extracted_at = NOW(), updated_at = NOW() WHERE id = $2"#,
    )
    .bind(sqlx::types::Json(merged))
    .bind(link_id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = update {
        let _ = tx.rollback().await;
        mark_background_job_failed(pool, job_id, &format!("Failed to save metadata: {e}")).await;
        return Err(e.to_string());
    }

    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'completed', error_message = NULL, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = tx.commit().await {
        mark_background_job_failed(
            pool,
            job_id,
            &format!("Failed to commit metadata update: {e}"),
        )
        .await;
        return Err(e.to_string());
    }

    info!(
        event = "github_metadata.job_ok",
        job_id = %job_id,
        link_id = %link_id,
        "GitHub metadata saved"
    );
    Ok(())
}
