//! Global background job queue: dequeue, per-type concurrency / pacing, pluggable handlers.
//!
//! To add a job type: define a `JOB_TYPE_*` constant, insert rows with `job_type` and JSON `payload`,
//! extend `policies_from_config` with limits, and add a branch in `run_one_job` that runs your worker
//! (updating `background_jobs` status when finished).

mod budget;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use budget::TypeBudgets;
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::{error, info};

use crate::config::AppConfig;
use crate::github_metadata;
use crate::id::new_cuid;

pub const JOB_TYPE_GITHUB_LINK_METADATA: &str = "github_link_metadata";

/// Policies applied before a job of this type is marked `processing` (concurrency + optional pacing).
#[derive(Clone, Debug)]
pub struct JobTypePolicy {
    pub max_concurrent: u32,
    /// Minimum wall time between *starting* two jobs of this type (in addition to in-flight cap).
    pub min_interval_between_starts: Option<Duration>,
}

impl Default for JobTypePolicy {
    fn default() -> Self {
        Self {
            max_concurrent: 8,
            min_interval_between_starts: None,
        }
    }
}

fn policies_from_config(config: &AppConfig) -> HashMap<String, JobTypePolicy> {
    let mut m = HashMap::new();
    m.insert(
        JOB_TYPE_GITHUB_LINK_METADATA.to_string(),
        JobTypePolicy {
            max_concurrent: config.job_queue_github_max_concurrent.max(1),
            // Spacing between starts is enforced in SQL using one GitHub job start per UTC clock minute
            // (`try_claim_next`); `JOB_QUEUE_GITHUB_MIN_START_INTERVAL_SECS` is not applied to this type.
            min_interval_between_starts: None,
        },
    );
    m
}

async fn mark_job_failed(pool: &PgPool, job_id: &str, msg: &str) {
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

/// Enqueue GitHub link metadata refresh if none pending/processing for this link.
///
/// The worker runs at most **one** `github_link_metadata` job per **UTC clock minute** (see claim SQL).
pub async fn enqueue_github_link_metadata_job(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<(String, bool), sqlx::Error> {
    let dedupe_key = format!("{JOB_TYPE_GITHUB_LINK_METADATA}:{link_id}");
    let pending: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM background_jobs
           WHERE job_type = $1 AND dedupe_key = $2 AND status IN ('pending', 'processing')
           ORDER BY created_at ASC LIMIT 1"#,
    )
    .bind(JOB_TYPE_GITHUB_LINK_METADATA)
    .bind(&dedupe_key)
    .fetch_optional(pool)
    .await?;

    if let Some(existing_id) = pending {
        return Ok((existing_id, true));
    }

    let id = new_cuid();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW(), NULL)"#,
    )
    .bind(&id)
    .bind(JOB_TYPE_GITHUB_LINK_METADATA)
    .bind(sqlx::types::Json(json!({ "link_id": link_id })))
    .bind(&dedupe_key)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok((id, false))
}

fn payload_link_id(payload: &serde_json::Value) -> Option<String> {
    payload.get("link_id")?.as_str().map(String::from)
}

async fn run_one_job(
    pool: &PgPool,
    client: &Client,
    github_http_min_interval: Duration,
    job_id: String,
    job_type: String,
    payload: serde_json::Value,
) {
    match job_type.as_str() {
        JOB_TYPE_GITHUB_LINK_METADATA => {
            if let Some(link_id) = payload_link_id(&payload) {
                let _ = github_metadata::execute_github_link_metadata_job(
                    pool,
                    client,
                    github_http_min_interval,
                    &job_id,
                    &link_id,
                )
                .await;
            } else {
                mark_job_failed(&pool, &job_id, "Missing payload.link_id").await;
            }
        }
        other => {
            mark_job_failed(
                &pool,
                &job_id,
                &format!("No handler registered for job type {other}"),
            )
            .await;
        }
    }
}

async fn try_claim_next(
    pool: &PgPool,
    budgets: &TypeBudgets,
) -> Option<(String, String, serde_json::Value)> {
    let rows: Vec<(String, String, serde_json::Value)> = sqlx::query(
        r#"SELECT id, job_type, payload FROM background_jobs
           WHERE status = 'pending'
             AND (run_after IS NULL OR run_after <= clock_timestamp())
           ORDER BY priority DESC, created_at ASC
           LIMIT 32"#,
    )
    .map(|row: sqlx::postgres::PgRow| {
        (
            row.get::<String, _>("id"),
            row.get::<String, _>("job_type"),
            row.get::<serde_json::Value, _>("payload"),
        )
    })
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for (id, job_type, payload) in rows {
        if !budgets.try_acquire(&job_type) {
            continue;
        }

        let claimed = if job_type == JOB_TYPE_GITHUB_LINK_METADATA {
            // At most one GitHub metadata job may *start* per UTC wall-clock minute (epoch minute bucket).
            sqlx::query_scalar::<_, String>(
                r#"UPDATE background_jobs AS b
                   SET status = 'processing',
                       started_at = clock_timestamp(),
                       updated_at = clock_timestamp()
                   WHERE b.id = $1
                     AND b.job_type = $2
                     AND b.status = 'pending'
                     AND (b.run_after IS NULL OR b.run_after <= clock_timestamp())
                     AND NOT EXISTS (
                       SELECT 1 FROM background_jobs AS g
                       WHERE g.job_type = $2
                         AND g.id <> b.id
                         AND g.started_at IS NOT NULL
                         AND (EXTRACT(EPOCH FROM g.started_at)::bigint / 60)
                             = (EXTRACT(EPOCH FROM clock_timestamp())::bigint / 60)
                     )
                   RETURNING b.id"#,
            )
            .bind(&id)
            .bind(JOB_TYPE_GITHUB_LINK_METADATA)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
        } else {
            sqlx::query_scalar::<_, String>(
                r#"UPDATE background_jobs
                   SET status = 'processing',
                       started_at = clock_timestamp(),
                       updated_at = clock_timestamp()
                   WHERE id = $1 AND status = 'pending'
                     AND (run_after IS NULL OR run_after <= clock_timestamp())
                   RETURNING id"#,
            )
            .bind(&id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
        };

        if claimed.is_none() {
            budgets.release(&job_type);
            continue;
        }
        return Some((id, job_type, payload));
    }
    None
}

pub fn spawn_job_queue_worker(pool: PgPool, config: AppConfig) {
    let policies = policies_from_config(&config);
    let budgets = Arc::new(TypeBudgets::new(policies));
    let github_http_min = Duration::from_secs(config.github_metadata_min_interval_secs.max(1));

    tokio::spawn(async move {
        let client = match Client::builder().timeout(Duration::from_secs(60)).build() {
            Ok(c) => c,
            Err(e) => {
                error!(event = "job_queue.client", error = %e, "reqwest client build failed");
                return;
            }
        };

        info!(
            event = "job_queue.worker_start",
            "background job worker started"
        );

        loop {
            tokio::time::sleep(Duration::from_millis(400)).await;
            if let Some((job_id, job_type, payload)) = try_claim_next(&pool, &budgets).await {
                run_one_job(
                    &pool,
                    &client,
                    github_http_min,
                    job_id.clone(),
                    job_type.clone(),
                    payload,
                )
                .await;
                budgets.release(&job_type);
            }
        }
    });
}

