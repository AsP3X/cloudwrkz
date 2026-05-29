//! Global background job queue: dequeue, per-type concurrency / pacing, pluggable handlers.
//!
//! Operator documentation: repository root `docs/background-jobs-and-github.md`.
//!
//! To add a job type: define a `JOB_TYPE_*` constant, insert rows with `job_type` and JSON `payload`,
//! extend `policies_from_config` with limits, and add a branch in `run_one_job` that runs your worker
//! (updating `background_jobs` status when finished).
//!
//! The dispatcher loop claims jobs and spawns each as its own async task so **multiple jobs can run
//! concurrently** up to each type's `max_concurrent` (and optional `min_interval_between_starts` when set).
//!
//! Dispatcher and per-job lifecycle lines use `tracing::debug!` with **target `jobs`** (`event` fields
//! `jobs.daemon_ready`, `jobs.daemon_wake`, `jobs.job_start`, `jobs.job_done`). Enable with
//! `LOG_VERBOSITY=debug` (default filter includes `jobs=debug`) or `RUST_LOG=info,jobs=debug`.

// Human: Background workers dequeue `background_jobs` rows, enforce per-type concurrency budgets, and dispatch to typed handlers (GitHub, QR, entity creates).
// Agent: OWNS policies_from_config, try_claim_next FOR UPDATE SKIP LOCKED, run_one_job match on job_type, supervised wall-timeout wrapper, dispatcher loop + stale reclaim.

mod budget;
pub mod control;
pub mod entity_creates;
pub mod job_log;
pub mod run_registry;
pub mod supervisor;
mod time_entry_mutations;

pub use control::{JobControlError, cancel_pending_job, restart_job, stop_processing_job};
pub use job_log::{
    JobLogRegistry, JobLogger, append_system_job_log_line, append_system_job_log_line_with_registry,
    fetch_job_log_lines, payload_keys_summary,
};
pub use run_registry::JobRunRegistry;
pub use supervisor::{resolve_initial_worker_count, spawn_job_queue_supervisor};

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use budget::{BudgetReleaseOnDrop, TypeBudgets};
use job_log::persist_job_log_line;
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::{debug, error, info, warn};

use crate::command_queue::MutationBroker;
use crate::config::AppConfig;
use crate::github_metadata;
use crate::github_rate_limit::GithubRestRateLimit;
use crate::id::new_cuid;

/// Higher than default entity-create jobs so link preview work is not starved by mutation backlog.
const LINK_PREVIEW_JOB_PRIORITY: i16 = 8;

pub const JOB_TYPE_GITHUB_LINK_METADATA: &str = "github_link_metadata";
pub const JOB_TYPE_WEBSITE_LINK_METADATA: &str = "website_link_metadata";
pub const JOB_TYPE_LINK_WEBSITE_SCREENSHOT: &str = "link_website_screenshot";
pub const JOB_TYPE_QR_LOGIN_APPROVE: &str = "qr_login_approve";
pub const JOB_TYPE_QR_LOGIN_FINALIZE: &str = "qr_login_finalize";
/// Email/password sign-in queued from `POST /auth/login` (processed by [`crate::auth::login_queue`], not the global dequeue loop).
pub const JOB_TYPE_AUTH_LOGIN: &str = "auth_login";
/// Registration queued from `POST /auth/register` (processed by [`crate::auth::register_queue`]).
pub const JOB_TYPE_AUTH_REGISTER: &str = "auth_register";

/// Hard cap on wall-clock time for one `run_one_job` task (panic/ hang safety net).
const RUN_ONE_JOB_WALL_TIMEOUT: Duration = Duration::from_secs(600);

/// If a row stays `processing` longer than this, assume a crashed worker or lost task and mark failed.
/// Slow preview / GitHub jobs use separate requeue thresholds in [`reclaim_stale_processing_jobs`].
const STALE_PROCESSING_AFTER_MINUTES: i32 = 3;

/// Requeue preview / GitHub jobs stuck in `processing` (worker crash, deploy restart, hung Chromium).
const STALE_WEBSITE_METADATA_REQUEUE_MINUTES: i32 = 12;
/// Screenshot jobs without log activity are requeued after this many minutes (Chromium cap is ~60–150s).
const STALE_SCREENSHOT_REQUEUE_MINUTES: i32 = 6;
const STALE_GITHUB_METADATA_REQUEUE_MINUTES: i32 = 45;
/// Fail screenshot rows still `processing` with no persisted log after this many minutes (orphan rows).
const STALE_SCREENSHOT_FAIL_EMPTY_LOG_MINUTES: i32 = 2;
/// Handler never logged progress after claim; row moves to `stalling` (see [`mark_stale_processing_as_stalling`]).
const STALL_WITHOUT_HANDLER_AFTER_SECONDS: i32 = 90;

pub const JOB_STATUS_STALLING: &str = "stalling";

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

// Human: Each job type gets max concurrency and optional pacing so GitHub or ticket bursts cannot starve unrelated work.
// Agent: BUILDS HashMap from AppConfig github max + fixed QR limits + entity_creates JOB_TYPE_* keys default max_concurrent 8.

pub(super) fn policies_from_config(config: &AppConfig) -> HashMap<String, JobTypePolicy> {
    let mut m = HashMap::new();
    m.insert(
        JOB_TYPE_GITHUB_LINK_METADATA.to_string(),
        JobTypePolicy {
            max_concurrent: config.job_queue_github_max_concurrent.max(1),
            min_interval_between_starts: None,
        },
    );
    m.insert(
        JOB_TYPE_WEBSITE_LINK_METADATA.to_string(),
        JobTypePolicy {
            max_concurrent: 3,
            min_interval_between_starts: None,
        },
    );
    m.insert(
        JOB_TYPE_LINK_WEBSITE_SCREENSHOT.to_string(),
        JobTypePolicy {
            max_concurrent: config.job_queue_screenshot_max_concurrent.max(1),
            min_interval_between_starts: None,
        },
    );
    m.insert(
        JOB_TYPE_QR_LOGIN_APPROVE.to_string(),
        JobTypePolicy {
            max_concurrent: 32,
            min_interval_between_starts: None,
        },
    );
    m.insert(
        JOB_TYPE_QR_LOGIN_FINALIZE.to_string(),
        JobTypePolicy {
            max_concurrent: 32,
            min_interval_between_starts: None,
        },
    );
    m.insert(
        entity_creates::JOB_TYPE_TICKET_CREATE.to_string(),
        JobTypePolicy {
            max_concurrent: 1,
            min_interval_between_starts: None,
        },
    );
    for t in [
        entity_creates::JOB_TYPE_TICKET_UPDATE,
        entity_creates::JOB_TYPE_TICKET_DELETE,
        entity_creates::JOB_TYPE_TICKET_COMMENT_CREATE,
        entity_creates::JOB_TYPE_TODO_CREATE,
        entity_creates::JOB_TYPE_TODO_UPDATE,
        entity_creates::JOB_TYPE_TODO_DELETE,
        entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_TIMER,
        entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_MANUAL,
        entity_creates::JOB_TYPE_TIME_ENTRY_UPDATE,
        entity_creates::JOB_TYPE_TIME_ENTRY_DELETE,
        entity_creates::JOB_TYPE_TIME_ENTRY_STOP,
        entity_creates::JOB_TYPE_TIME_ENTRY_PAUSE,
        entity_creates::JOB_TYPE_TIME_ENTRY_RESUME,
        entity_creates::JOB_TYPE_TIME_ENTRY_COMPLETE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_CREATE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_UPDATE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_DELETE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_UPDATE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_DELETE,
        entity_creates::JOB_TYPE_LINK_CREATE,
        entity_creates::JOB_TYPE_LINK_UPDATE,
        entity_creates::JOB_TYPE_LINK_DELETE,
        entity_creates::JOB_TYPE_COLLECTION_CREATE,
        entity_creates::JOB_TYPE_COLLECTION_UPDATE,
        entity_creates::JOB_TYPE_COLLECTION_DELETE,
    ] {
        m.insert(
            t.to_string(),
            JobTypePolicy {
                max_concurrent: 8,
                min_interval_between_starts: None,
            },
        );
    }
    m
}

// Human: When a job cannot complete, we still try to flip the row to failed so operators see an error_message instead of a stuck pending row.
// Agent: UPDATE background_jobs SET status failed, error_message, completed_at WHERE id = job_id; IGNORES sqlx result at call sites.

async fn mark_job_failed(pool: &PgPool, job_id: &str, msg: &str, logger: Option<&JobLogger>) {
    if let Some(log) = logger {
        log.log_critical(&format!("Job failed: {msg}")).await;
    }
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1 AND status = 'processing'"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

/// Fails jobs stuck in `processing` (e.g. process crash or task panic before `mark_job_failed`).
/// Slow link-preview and GitHub jobs are requeued instead of failed (see [`requeue_stale_preview_jobs`]).
// Human: Crashed workers can leave rows in `processing` forever; this periodic sweep marks old ones failed except long GitHub/auth jobs.
// Agent: UPDATE background_jobs WHERE processing AND started_at older than STALE_PROCESSING_AFTER_MINUTES; EXCLUDES preview/github/auth types handled separately.

pub(super) async fn requeue_interrupted_processing_jobs(pool: &PgPool) {
    let rows = match sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'pending',
               started_at = NULL,
               run_after = clock_timestamp(),
               updated_at = clock_timestamp()
           WHERE status = 'processing'
             AND job_type NOT IN ('auth_login', 'auth_register')
           RETURNING id, job_type"#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "jobs",
                event = "jobs.startup_requeue_failed",
                error = %e,
                "could not requeue interrupted processing jobs on startup"
            );
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    info!(
        target: "jobs",
        event = "jobs.startup_requeue",
        count = rows.len(),
        "requeued processing jobs after worker startup"
    );

    for row in rows {
        let id: String = row.get("id");
        let job_type: String = row.get("job_type");
        append_system_job_log_line(
            pool,
            &id,
            &format!("Requeued after API worker restart (was processing, type={job_type})"),
        )
        .await;
    }
}

async fn requeue_stale_preview_jobs(pool: &PgPool, job_type: &str, after_minutes: i32) {
    let rows = match sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'pending',
               started_at = NULL,
               run_after = clock_timestamp() + interval '200 milliseconds',
               updated_at = clock_timestamp()
           WHERE status = 'processing'
             AND job_type = $1
             AND started_at IS NOT NULL
             AND started_at < clock_timestamp() - ($2::integer * interval '1 minute')
           RETURNING id"#,
    )
    .bind(job_type)
    .bind(after_minutes)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "jobs",
                event = "jobs.stale_requeue_failed",
                job_type = %job_type,
                error = %e,
                "could not requeue stale preview job"
            );
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    warn!(
        target: "jobs",
        event = "jobs.stale_requeue",
        job_type = %job_type,
        count = rows.len(),
        after_minutes,
        "requeued stale processing preview jobs"
    );

    for row in rows {
        let id: String = row.get("id");
        append_system_job_log_line(
            pool,
            &id,
            &format!(
                "Requeued after {after_minutes}m in processing without completion (type={job_type})"
            ),
        )
        .await;
    }
}

/// Requeue `processing` rows that never received `started_at` (invalid orphan state).
// Human: A row cannot legitimately be processing without a claim timestamp; reset to pending so a worker can pick it up.
// Agent: UPDATE processing→pending WHERE started_at IS NULL; EXCLUDES auth job types; APPENDS system log per id.

async fn requeue_processing_without_started_at(pool: &PgPool) {
    let rows = match sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'pending',
               started_at = NULL,
               run_after = clock_timestamp() + interval '200 milliseconds',
               updated_at = clock_timestamp()
           WHERE status = 'processing'
             AND started_at IS NULL
             AND job_type NOT IN ('auth_login', 'auth_register')
           RETURNING id, job_type"#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "jobs",
                event = "jobs.requeue_no_started_at_failed",
                error = %e,
                "could not requeue processing jobs missing started_at"
            );
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    warn!(
        target: "jobs",
        event = "jobs.requeue_no_started_at",
        count = rows.len(),
        "requeued processing jobs that had no started_at"
    );

    for row in rows {
        let id: String = row.get("id");
        let job_type: String = row.get("job_type");
        append_system_job_log_line(
            pool,
            &id,
            &format!("Requeued: row was processing without started_at (type={job_type})"),
        )
        .await;
    }
}

/// Mark stale screenshot jobs failed when no worker ever wrote a processing log line.
// Human: If a row sits processing for minutes with an empty log, no handler actually ran — fail instead of looping forever.
// Agent: UPDATE processing→failed WHERE link_website_screenshot AND empty processing_log AND started_at older than threshold.

async fn fail_stale_screenshot_jobs_without_logs(pool: &PgPool, after_minutes: i32) {
    let rows = match sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'failed',
               error_message = 'Screenshot job stalled with no worker log activity',
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE status = 'processing'
             AND job_type = $1
             AND started_at IS NOT NULL
             AND started_at < clock_timestamp() - ($2::integer * interval '1 minute')
             AND (
               processing_log IS NULL
               OR jsonb_typeof(processing_log) <> 'array'
               OR jsonb_array_length(processing_log) = 0
               OR NOT EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements_text(processing_log) AS elem(line)
                 WHERE line LIKE '%Job processing started%'
                    OR line LIKE '%Handler task started%'
               )
             )
           RETURNING id"#,
    )
    .bind(JOB_TYPE_LINK_WEBSITE_SCREENSHOT)
    .bind(after_minutes)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "jobs",
                event = "jobs.stale_fail_empty_log_failed",
                error = %e,
                "could not fail stale screenshot jobs with empty logs"
            );
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    warn!(
        target: "jobs",
        event = "jobs.stale_fail_empty_log",
        count = rows.len(),
        after_minutes,
        "failed stale screenshot jobs with no processing_log activity"
    );

    for row in rows {
        let id: String = row.get("id");
        append_system_job_log_line(
            pool,
            &id,
            &format!(
                "Marked failed after {after_minutes}m in processing with no worker log lines"
            ),
        )
        .await;
    }
}

/// Mark rows stuck after SQL claim when the handler task never logged progress (releases budget slots).
// Human: Claim writes one line immediately; if nothing follows within ~90s the worker task never ran — mark `stalling` so operators see it and dispatchers reclaim it.
// Agent: UPDATE processing→stalling WHERE no handler log markers; CALLS budgets.release per job_type; APPENDS system log; RECLAIMED by try_claim_next (stalling before pending).

async fn mark_stale_processing_as_stalling(
    pool: &PgPool,
    budgets: &TypeBudgets,
    after_seconds: i32,
) {
    let rows = match sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'stalling',
               started_at = NULL,
               run_after = NULL,
               updated_at = clock_timestamp()
           WHERE status = 'processing'
             AND started_at IS NOT NULL
             AND started_at < clock_timestamp() - ($1::integer * interval '1 second')
             AND job_type NOT IN ('auth_login', 'auth_register')
             AND NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(COALESCE(processing_log, '[]'::jsonb)) AS elem(line)
               WHERE line LIKE '%Job processing started%'
                  OR line LIKE '%Handler task started%'
             )
           RETURNING id, job_type"#,
    )
    .bind(after_seconds)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!(
                target: "jobs",
                event = "jobs.mark_stalling_failed",
                error = %e,
                "could not mark processing jobs as stalling"
            );
            return;
        }
    };

    if rows.is_empty() {
        return;
    }

    warn!(
        target: "jobs",
        event = "jobs.mark_stalling",
        count = rows.len(),
        after_seconds,
        "marked processing jobs as stalling (handler never started)"
    );

    for row in rows {
        let id: String = row.get("id");
        let job_type: String = row.get("job_type");
        budgets.release(&job_type);
        append_system_job_log_line(
            pool,
            &id,
            &format!(
                "Marked stalling after {after_seconds}s: handler task never started (released budget slot; worker will reclaim)"
            ),
        )
        .await;
    }
}

pub(super) async fn reclaim_stale_processing_jobs(pool: &PgPool, budgets: &TypeBudgets) {
    requeue_processing_without_started_at(pool).await;
    mark_stale_processing_as_stalling(pool, budgets, STALL_WITHOUT_HANDLER_AFTER_SECONDS).await;
    fail_stale_screenshot_jobs_without_logs(pool, STALE_SCREENSHOT_FAIL_EMPTY_LOG_MINUTES).await;
    requeue_stale_preview_jobs(
        pool,
        JOB_TYPE_WEBSITE_LINK_METADATA,
        STALE_WEBSITE_METADATA_REQUEUE_MINUTES,
    )
    .await;
    requeue_stale_preview_jobs(
        pool,
        JOB_TYPE_LINK_WEBSITE_SCREENSHOT,
        STALE_SCREENSHOT_REQUEUE_MINUTES,
    )
    .await;
    requeue_stale_preview_jobs(
        pool,
        JOB_TYPE_GITHUB_LINK_METADATA,
        STALE_GITHUB_METADATA_REQUEUE_MINUTES,
    )
    .await;

    let res = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'failed',
               error_message = 'Job stalled in processing (reclaimed by worker)',
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE status = 'processing'
             AND started_at IS NOT NULL
             AND started_at < clock_timestamp() - ($1::integer * interval '1 minute')
             AND job_type NOT IN (
               'github_link_metadata',
               'website_link_metadata',
               'link_website_screenshot',
               'auth_login',
               'auth_register'
             )"#,
    )
    .bind(STALE_PROCESSING_AFTER_MINUTES)
    .execute(pool)
    .await;

    if let Ok(r) = res {
        if r.rows_affected() > 0 {
            warn!(
                target: "jobs",
                event = "jobs.stale_processing_reclaimed",
                count = r.rows_affected(),
                "marked stale processing jobs as failed"
            );
        }
    }
}

/// Enqueue GitHub link metadata refresh if none pending/processing for this link.
// Human: Link saves trigger at most one pending GitHub metadata refresh per link so retries do not flood the queue.
// Agent: SELECT existing pending/processing by dedupe_key; OR INSERT new row with payload {link_id}; RETURNS (id, reused bool).

pub async fn enqueue_github_link_metadata_job(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<(String, bool), sqlx::Error> {
    let dedupe_key = format!("{JOB_TYPE_GITHUB_LINK_METADATA}:{link_id}");
    let pending: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM background_jobs
           WHERE job_type = $1 AND dedupe_key = $2 AND status IN ('pending', 'processing', 'stalling')
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

/// Enqueue website HTML metadata scrape if none pending/processing for this link.
// Human: Non-GitHub bookmarks can refresh Open Graph data in the background without blocking link saves.
// Agent: dedupe_key website_link_metadata:{link_id}; INSERT background_jobs pending; RETURNS (id, reused).

pub async fn enqueue_website_link_metadata_job(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<(String, bool), sqlx::Error> {
    let dedupe_key = format!("{JOB_TYPE_WEBSITE_LINK_METADATA}:{link_id}");
    let pending: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM background_jobs
           WHERE job_type = $1 AND dedupe_key = $2 AND status IN ('pending', 'processing', 'stalling')
           ORDER BY created_at ASC LIMIT 1"#,
    )
    .bind(JOB_TYPE_WEBSITE_LINK_METADATA)
    .bind(&dedupe_key)
    .fetch_optional(pool)
    .await?;

    if let Some(existing_id) = pending {
        return Ok((existing_id, true));
    }

    let id = new_cuid();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, priority, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW(), NOW(), NULL)"#,
    )
    .bind(&id)
    .bind(JOB_TYPE_WEBSITE_LINK_METADATA)
    .bind(sqlx::types::Json(json!({ "link_id": link_id })))
    .bind(&dedupe_key)
    .bind(user_id)
    .bind(LINK_PREVIEW_JOB_PRIORITY)
    .execute(pool)
    .await?;
    Ok((id, false))
}

/// Enqueue headless screenshot capture if none pending/processing for this link.
// Human: Screenshots run separately from HTML metadata so Chromium work does not block Open Graph scraping.
// Agent: dedupe_key link_website_screenshot:{link_id}; INSERT background_jobs pending; RETURNS (id, reused).

pub async fn enqueue_link_website_screenshot_job(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<(String, bool), sqlx::Error> {
    let dedupe_key = format!("{JOB_TYPE_LINK_WEBSITE_SCREENSHOT}:{link_id}");
    let pending: Option<String> = sqlx::query_scalar(
        r#"SELECT id FROM background_jobs
           WHERE job_type = $1 AND dedupe_key = $2 AND status IN ('pending', 'processing', 'stalling')
           ORDER BY created_at ASC LIMIT 1"#,
    )
    .bind(JOB_TYPE_LINK_WEBSITE_SCREENSHOT)
    .bind(&dedupe_key)
    .fetch_optional(pool)
    .await?;

    if let Some(existing_id) = pending {
        return Ok((existing_id, true));
    }

    let id = new_cuid();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, priority, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW(), NOW(), NULL)"#,
    )
    .bind(&id)
    .bind(JOB_TYPE_LINK_WEBSITE_SCREENSHOT)
    .bind(sqlx::types::Json(json!({ "link_id": link_id })))
    .bind(&dedupe_key)
    .bind(user_id)
    .bind(LINK_PREVIEW_JOB_PRIORITY)
    .execute(pool)
    .await?;
    Ok((id, false))
}

/// Enqueue both website HTML metadata and screenshot jobs for a non-GitHub link.
// Human: Create, URL change, and manual refresh should schedule metadata scrape and screenshot capture together.
// Agent: CALLS enqueue_website_link_preview_jobs_selective with both flags true.

#[derive(Debug, Clone)]
pub struct WebsiteLinkPreviewJobs {
    pub metadata_job_id: Option<String>,
    pub metadata_already_queued: bool,
    pub screenshot_job_id: Option<String>,
    pub screenshot_already_queued: bool,
}

// Human: Callers choose metadata and/or screenshot so existing links can queue capture without re-scraping HTML.
// Agent: OPTIONAL enqueue_website_link_metadata_job + enqueue_link_website_screenshot_job; RETURNS per-branch ids.

pub async fn enqueue_website_link_preview_jobs_selective(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
    include_metadata: bool,
    include_screenshot: bool,
) -> Result<WebsiteLinkPreviewJobs, sqlx::Error> {
    let (metadata_job_id, metadata_already_queued) = if include_metadata {
        let (id, reused) = enqueue_website_link_metadata_job(pool, link_id, user_id).await?;
        (Some(id), reused)
    } else {
        (None, false)
    };
    let (screenshot_job_id, screenshot_already_queued) = if include_screenshot {
        let (id, reused) = enqueue_link_website_screenshot_job(pool, link_id, user_id).await?;
        (Some(id), reused)
    } else {
        (None, false)
    };
    Ok(WebsiteLinkPreviewJobs {
        metadata_job_id,
        metadata_already_queued,
        screenshot_job_id,
        screenshot_already_queued,
    })
}

pub async fn enqueue_website_link_preview_jobs(
    pool: &PgPool,
    link_id: &str,
    user_id: &str,
) -> Result<WebsiteLinkPreviewJobs, sqlx::Error> {
    enqueue_website_link_preview_jobs_selective(pool, link_id, user_id, true, true).await
}

// Human: GitHub metadata jobs only need the link id string from their JSON payload.
// Agent: READS payload["link_id"] as str; RETURNS Some owned String or None.

fn payload_link_id(payload: &serde_json::Value) -> Option<String> {
    payload.get("link_id")?.as_str().map(String::from)
}

// Human: One claimed row becomes a dispatched async call into the right subsystem; unknown types become immediate failures.
// Agent: MATCH job_type string; CALLS github_metadata, qr_login_execute, qr_finalize_queue, or entity_creates::run_entity_create_job; ELSE mark_job_failed unknown type.

async fn run_one_job(
    pool: &PgPool,
    client: &Client,
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    job_id: String,
    job_type: String,
    payload: serde_json::Value,
    created_by_user_id: Option<String>,
    logger: JobLogger,
) {
    logger
        .log_critical(&format!(
            "Dispatching handler for job_type={job_type} ({})",
            payload_keys_summary(&payload)
        ))
        .await;
    match job_type.as_str() {
        JOB_TYPE_GITHUB_LINK_METADATA => {
            if let Some(link_id) = payload_link_id(&payload) {
                logger.log(&format!("GitHub metadata enrichment for link_id={link_id}"));
                let _ = github_metadata::execute_github_link_metadata_job(
                    pool,
                    client,
                    &github_rate,
                    &job_id,
                    &link_id,
                    Some(&logger),
                )
                .await;
            } else {
                mark_job_failed(
                    &pool,
                    &job_id,
                    "Missing payload.link_id",
                    Some(&logger),
                )
                .await;
            }
        }
        JOB_TYPE_WEBSITE_LINK_METADATA => {
            if let Some(link_id) = payload_link_id(&payload) {
                logger.log(&format!("Website metadata scrape for link_id={link_id}"));
                crate::website_link_metadata::execute_website_link_metadata_job(
                    pool,
                    client,
                    &job_id,
                    &link_id,
                    created_by_user_id.as_deref(),
                    Some(&logger),
                )
                .await;
            } else {
                mark_job_failed(
                    &pool,
                    &job_id,
                    "Missing payload.link_id",
                    Some(&logger),
                )
                .await;
            }
        }
        JOB_TYPE_LINK_WEBSITE_SCREENSHOT => {
            if let Some(link_id) = payload_link_id(&payload) {
                logger
                    .log_critical(&format!("Website screenshot capture for link_id={link_id}"))
                    .await;
                crate::link_screenshot_job::execute_link_screenshot_job(
                    pool,
                    client,
                    &job_id,
                    &link_id,
                    Some(&logger),
                )
                .await;
            } else {
                mark_job_failed(
                    &pool,
                    &job_id,
                    "Missing payload.link_id",
                    Some(&logger),
                )
                .await;
            }
        }
        JOB_TYPE_QR_LOGIN_APPROVE => {
            logger.log("QR login approve handler");
            crate::auth::qr_login_execute::execute_qr_login_approve_job(
                pool,
                &job_id,
                &payload,
                created_by_user_id.as_deref(),
                Some(&logger),
            )
            .await;
        }
        JOB_TYPE_QR_LOGIN_FINALIZE => {
            logger.log("QR login finalize handler");
            crate::auth::qr_finalize_queue::execute_qr_login_finalize_job(
                pool,
                &job_id,
                &payload,
                Some(&logger),
            )
            .await;
        }
        entity_creates::JOB_TYPE_TICKET_CREATE
        | entity_creates::JOB_TYPE_TICKET_UPDATE
        | entity_creates::JOB_TYPE_TICKET_DELETE
        | entity_creates::JOB_TYPE_TICKET_COMMENT_CREATE
        | entity_creates::JOB_TYPE_TODO_CREATE
        | entity_creates::JOB_TYPE_TODO_UPDATE
        | entity_creates::JOB_TYPE_TODO_DELETE
        | entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_TIMER
        | entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_MANUAL
        | entity_creates::JOB_TYPE_TIME_ENTRY_UPDATE
        | entity_creates::JOB_TYPE_TIME_ENTRY_DELETE
        | entity_creates::JOB_TYPE_TIME_ENTRY_STOP
        | entity_creates::JOB_TYPE_TIME_ENTRY_PAUSE
        | entity_creates::JOB_TYPE_TIME_ENTRY_RESUME
        | entity_creates::JOB_TYPE_TIME_ENTRY_COMPLETE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_CREATE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_UPDATE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_DELETE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BULK_UPDATE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE
        | entity_creates::JOB_TYPE_TIME_ENTRY_BULK_DELETE
        | entity_creates::JOB_TYPE_LINK_CREATE
        | entity_creates::JOB_TYPE_LINK_UPDATE
        | entity_creates::JOB_TYPE_LINK_DELETE
        | entity_creates::JOB_TYPE_COLLECTION_CREATE
        | entity_creates::JOB_TYPE_COLLECTION_UPDATE
        | entity_creates::JOB_TYPE_COLLECTION_DELETE
        | entity_creates::JOB_TYPE_EMPLOYEE_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_UPDATE
        | entity_creates::JOB_TYPE_EMPLOYEE_DELETE
        | entity_creates::JOB_TYPE_EMPLOYEE_ADD_EMAIL
        | entity_creates::JOB_TYPE_EMPLOYEE_REMOVE_EMAIL
        | entity_creates::JOB_TYPE_EMPLOYEE_ADD_MANAGER
        | entity_creates::JOB_TYPE_EMPLOYEE_REMOVE_MANAGER
        | entity_creates::JOB_TYPE_EMPLOYEE_LINK_USER
        | entity_creates::JOB_TYPE_EMPLOYEE_UNLINK_USER => {
            logger.log("Entity mutation handler");
            entity_creates::run_entity_create_job(
                pool,
                client,
                &mutation_broker,
                &job_id,
                &job_type,
                &payload,
                &logger,
            )
            .await;
        }
        other => {
            mark_job_failed(
                &pool,
                &job_id,
                &format!("No handler registered for job type {other}"),
                Some(&logger),
            )
            .await;
        }
    }
}

// Human: Panics or infinite hangs should not wedge the budget slot forever, so we wrap the inner task with a wall timeout and abort handle.
// Agent: SPAWNS run_one_job with BudgetReleaseOnDrop; ON panic OR timeout CALLS mark_job_failed with distinct messages; AWAITS timeout(RUN_ONE_JOB_WALL_TIMEOUT).

async fn run_one_job_supervised(
    pool: PgPool,
    client: Client,
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    job_id: String,
    job_type: String,
    payload: serde_json::Value,
    created_by_user_id: Option<String>,
    job_runs: Arc<JobRunRegistry>,
    worker_id: u64,
    logger: JobLogger,
) {
    let job_id_for_log = job_id.clone();
    let job_type_for_log = job_type.clone();
    let pool_fail = pool.clone();

    logger
        .log_critical(&format!(
            "Job processing started (type={job_type_for_log}, worker_id={worker_id})"
        ))
        .await;

    let wall_timeout = if job_type_for_log == JOB_TYPE_LINK_WEBSITE_SCREENSHOT {
        crate::link_preview::screenshot_job_wall_timeout()
    } else {
        RUN_ONE_JOB_WALL_TIMEOUT
    };

    let logger_hb = logger.clone();
    let hb_job_type = job_type_for_log.clone();
    let heartbeat = tokio::spawn(async move {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(45));
        tick.tick().await;
        loop {
            tick.tick().await;
            logger_hb
                .log_critical(&format!(
                    "Worker heartbeat: still processing (type={hb_job_type})"
                ))
                .await;
        }
    });

    let logger_inner = logger.clone();
    let inner = tokio::spawn(async move {
        run_one_job(
            &pool,
            &client,
            github_rate,
            mutation_broker,
            job_id,
            job_type,
            payload,
            created_by_user_id,
            logger_inner,
        )
        .await;
    });

    job_runs.register(&job_id_for_log, inner.abort_handle());
    let abort = inner.abort_handle();
    let finish = async {
        match tokio::time::timeout(wall_timeout, inner).await {
            Ok(Ok(())) => {
                logger
                    .log_critical("Job processing finished")
                    .await;
            }
            Ok(Err(e)) => {
                if e.is_cancelled() {
                    logger
                        .log_critical("Job task aborted (admin stop or worker shutdown)")
                        .await;
                } else if e.is_panic() {
                    error!(
                        target: "jobs",
                        event = "jobs.job_panic",
                        job_id = %job_id_for_log,
                        job_type = %job_type_for_log,
                        "background job task panicked"
                    );
                    logger
                        .log_critical("Job panicked — marking failed")
                        .await;
                    mark_job_failed(
                        &pool_fail,
                        &job_id_for_log,
                        "Internal error: background job panicked",
                        Some(&logger),
                    )
                    .await;
                }
            }
            Err(_elapsed) => {
                abort.abort();
                error!(
                    target: "jobs",
                    event = "jobs.job_wall_timeout",
                    job_id = %job_id_for_log,
                    job_type = %job_type_for_log,
                    wall_secs = wall_timeout.as_secs(),
                    "background job exceeded wall-clock limit"
                );
                logger
                    .log_critical(&format!(
                        "Job exceeded wall-clock limit ({}s) — marking failed",
                        wall_timeout.as_secs()
                    ))
                    .await;
                mark_job_failed(
                    &pool_fail,
                    &job_id_for_log,
                    "Background job exceeded maximum processing time",
                    Some(&logger),
                )
                .await;
            }
        }
    };
    finish.await;
    heartbeat.abort();
    job_runs.unregister(&job_id_for_log);
}

/// Atomically claims the next eligible row using `FOR UPDATE SKIP LOCKED` so concurrent workers
/// never block waiting on another transaction's lock; if the per-type budget rejects the job,
/// the row is returned to `pending` or `stalling` with a short `run_after` deferral so the same worker does not
/// spin on an ineligible head-of-queue row. **`stalling` rows are preferred over `pending`** so stuck jobs recover first.
// Human: Workers compete fairly for the next runnable job; stalling jobs (handler never started) are reclaimed before fresh pending work.
// Agent: LOOP up to MAX_TRIES; UPDATE pending|stalling→processing FOR UPDATE SKIP LOCKED; CALLS budgets.try_acquire OR rolls row back with defer.

async fn try_claim_next(
    pool: &PgPool,
    budgets: &TypeBudgets,
    worker_id: u64,
    job_logs: &JobLogRegistry,
) -> Option<(String, String, serde_json::Value, Option<String>)> {
    const MAX_TRIES: u32 = 48;
    for _ in 0..MAX_TRIES {
        let row = match sqlx::query(
            r#"UPDATE background_jobs AS b
               SET status = 'processing',
                   started_at = clock_timestamp(),
                   updated_at = clock_timestamp(),
                   processing_log = COALESCE(b.processing_log, '[]'::jsonb) || jsonb_build_array(
                     to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                     || ' '
                     || CASE
                          WHEN picked.from_stalling THEN 'Row reclaimed from stalling (status=processing)'
                          ELSE 'Row claimed from queue (status=processing)'
                        END
                   )
               FROM (
                 SELECT bi.id, (bi.status = 'stalling') AS from_stalling
                 FROM background_jobs bi
                 WHERE bi.status IN ('pending', 'stalling')
                   AND (bi.run_after IS NULL OR bi.run_after <= clock_timestamp())
                 ORDER BY
                   CASE bi.status WHEN 'stalling' THEN 0 ELSE 1 END,
                   bi.priority DESC,
                   bi.created_at ASC
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
               ) AS picked
               WHERE b.id = picked.id
                 AND b.status IN ('pending', 'stalling')
                 AND (b.run_after IS NULL OR b.run_after <= clock_timestamp())
               RETURNING b.id, b.job_type, b.payload, b.created_by_user_id, picked.from_stalling"#,
        )
        .fetch_optional(pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                error!(
                    target: "jobs",
                    event = "jobs.claim_sql_error",
                    error = %e,
                    "background_jobs claim UPDATE failed (worker will retry)"
                );
                return None;
            }
        };
        let Some(row) = row else {
            return None;
        };

        let id: String = row.get("id");
        let job_type: String = row.get("job_type");
        let payload: serde_json::Value = row.get("payload");
        let created_by: Option<String> = row
            .try_get::<Option<String>, _>("created_by_user_id")
            .ok()
            .flatten();
        let from_stalling: bool = row.get("from_stalling");
        let claim_line = format!(
            "{} {}",
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ"),
            if from_stalling {
                "Row reclaimed from stalling (status=processing)"
            } else {
                "Row claimed from queue (status=processing)"
            }
        );

        job_logs.append_memory(&id, &claim_line);

        if !budgets.try_acquire(&job_type) {
            debug!(
                target: "jobs",
                event = "jobs.budget_reject",
                job_id = %id,
                job_type = %job_type,
                "per-type concurrency or start interval; row deferred (75ms)"
            );
            let defer_status = if from_stalling {
                JOB_STATUS_STALLING
            } else {
                "pending"
            };
            let defer_line = format!(
                "{} Deferred to {defer_status}: per-type concurrency limit (type={job_type})",
                chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ")
            );
            job_logs.append_memory(&id, &defer_line);
            persist_job_log_line(pool, &id, &defer_line).await;
            let _ = sqlx::query(
                r#"UPDATE background_jobs
                   SET status = $3,
                       started_at = NULL,
                       run_after = clock_timestamp() + interval '75 milliseconds',
                       updated_at = clock_timestamp(),
                       processing_log = COALESCE(processing_log, '[]'::jsonb) || jsonb_build_array($2::text)
                   WHERE id = $1 AND status = 'processing'"#,
            )
            .bind(&id)
            .bind(&defer_line)
            .bind(defer_status)
            .execute(pool)
            .await;
            continue;
        }

        let dispatch_line = format!(
            "{} Dispatcher worker_id={worker_id} spawning handler (type={job_type})",
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ")
        );
        job_logs.append_memory(&id, &dispatch_line);
        persist_job_log_line(pool, &id, &dispatch_line).await;

        return Some((id, job_type, payload, created_by));
    }
    None
}

/// One dequeue/spawn loop; `budgets` and `github_rate` are shared across all dispatchers in the process.
// Human: Each dispatcher thread alternates between short sleeps when busy and exponential backoff when idle, and periodically reclaims stale processing rows.
// Agent: LOOP sleep; MAYBE reclaim_stale_processing_jobs hourly; CLAIM batch up to MAX_CLAIMS_PER_WAKE; SPAWNS run_one_job_supervised per job; ADJUSTS sleep_ms busy vs idle.

pub(super) async fn run_job_queue_dispatcher_loop(
    pool: PgPool,
    client: Client,
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    budgets: Arc<TypeBudgets>,
    worker_id: u64,
    logs: Arc<supervisor::WorkerLogRegistry>,
    job_logs: Arc<JobLogRegistry>,
    job_runs: Arc<JobRunRegistry>,
) {
    info!(
        event = "job_queue.worker_start",
        worker_id, "background job dispatcher started"
    );
    logs.append(
        worker_id,
        "job queue dispatcher running (shared per-type budgets across dispatchers)",
    );
    debug!(
        target: "jobs",
        event = "jobs.daemon_ready",
        worker_id,
        "job queue dispatcher running (debug target `jobs`)"
    );

    /// Cap claims per wake so a deep backlog cannot starve the runtime in one tick.
    const MAX_CLAIMS_PER_WAKE: u32 = 128;
    /// Sleep while queue is actively draining (keeps start latency low under load).
    const BUSY_SLEEP_MS: u64 = 25;
    /// Initial sleep when no eligible jobs were claimed.
    const IDLE_SLEEP_MIN_MS: u64 = 400;
    /// Upper bound for idle exponential backoff.
    const IDLE_SLEEP_MAX_MS: u64 = 1_600;
    /// Sweep stale `processing` rows roughly every 30 seconds.
    const STALE_RECLAIM_INTERVAL: Duration = Duration::from_secs(30);
    let mut sleep_ms = IDLE_SLEEP_MIN_MS;
    let mut last_stale_reclaim = Instant::now();

    loop {
        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
        if last_stale_reclaim.elapsed() >= STALE_RECLAIM_INTERVAL {
            reclaim_stale_processing_jobs(&pool, &budgets).await;
            last_stale_reclaim = Instant::now();
        }

        let mut claimed_this_wake = 0u32;
        while claimed_this_wake < MAX_CLAIMS_PER_WAKE {
            let Some((job_id, job_type, payload, created_by_user_id)) =
                try_claim_next(&pool, &budgets, worker_id, &job_logs).await
            else {
                break;
            };
            claimed_this_wake += 1;
            let pool = pool.clone();
            let client = client.clone();
            let budgets = budgets.clone();
            let gh_rate = github_rate.clone();
            let mutation_broker = mutation_broker.clone();
            let job_logs_spawn = job_logs.clone();
            let job_runs_spawn = job_runs.clone();
            let job_id_for_log = job_id.clone();
            let job_type_for_log = job_type.clone();
            let job_type_for_spawn = job_type.clone();
            tokio::spawn(async move {
                let _budget_release =
                    BudgetReleaseOnDrop::new(budgets.clone(), job_type_for_spawn.clone());
                let logger =
                    JobLogger::new(job_logs_spawn.clone(), pool.clone(), &job_id_for_log);
                logger
                    .log_critical(&format!(
                        "Handler task started (worker_id={worker_id}, type={job_type_for_log})"
                    ))
                    .await;
                let started = Instant::now();
                debug!(
                    target: "jobs",
                    event = "jobs.job_start",
                    job_id = %job_id_for_log,
                    job_type = %job_type_for_log,
                    worker_id,
                    "background job processing started"
                );
                run_one_job_supervised(
                    pool,
                    client,
                    gh_rate,
                    mutation_broker,
                    job_id,
                    job_type,
                    payload,
                    created_by_user_id,
                    job_runs_spawn,
                    worker_id,
                    logger,
                )
                .await;
                debug!(
                    target: "jobs",
                    event = "jobs.job_done",
                    job_id = %job_id_for_log,
                    job_type = %job_type_for_log,
                    worker_id,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    "background job processing finished"
                );
            });
        }
        if claimed_this_wake > 0 {
            sleep_ms = BUSY_SLEEP_MS;
            debug!(
                target: "jobs",
                event = "jobs.daemon_wake",
                worker_id,
                spawned = claimed_this_wake,
                "job queue dispatcher claimed batch"
            );
            logs.append(
                worker_id,
                &format!("claimed {claimed_this_wake} job(s) this wake"),
            );
        } else {
            sleep_ms = (sleep_ms.saturating_mul(2)).clamp(IDLE_SLEEP_MIN_MS, IDLE_SLEEP_MAX_MS);
        }
    }
}

/// Backwards-compatible entry: spawns the supervised pool using `config.job_queue_worker_count`
/// for both the initial desired count and the env default metadata.
// Human: Older call sites still ask for “spawn N workers” in one helper; today that delegates to the supervisor with matching initial and default counts.
// Agent: READS config.job_queue_worker_count; CALLS spawn_job_queue_supervisor(pool, config, broker, n, n); RETURNS Arc JobWorkerSupervisor.

pub fn spawn_job_queue_worker(
    pool: PgPool,
    config: AppConfig,
    mutation_broker: MutationBroker,
) -> Arc<supervisor::JobWorkerSupervisor> {
    let n = config.job_queue_worker_count;
    spawn_job_queue_supervisor(pool, config, mutation_broker, n, n)
}
