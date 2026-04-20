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

mod budget;
pub mod entity_creates;
pub mod supervisor;
mod time_entry_mutations;

pub use supervisor::{resolve_initial_worker_count, spawn_job_queue_supervisor};

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use budget::{BudgetReleaseOnDrop, TypeBudgets};
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::{debug, error, info, warn};

use crate::command_queue::MutationBroker;
use crate::config::AppConfig;
use crate::github_metadata;
use crate::github_rate_limit::GithubRestRateLimit;
use crate::id::new_cuid;

pub const JOB_TYPE_GITHUB_LINK_METADATA: &str = "github_link_metadata";
pub const JOB_TYPE_QR_LOGIN_APPROVE: &str = "qr_login_approve";
pub const JOB_TYPE_QR_LOGIN_FINALIZE: &str = "qr_login_finalize";
/// Email/password sign-in queued from `POST /auth/login` (processed by [`crate::auth::login_queue`], not the global dequeue loop).
pub const JOB_TYPE_AUTH_LOGIN: &str = "auth_login";
/// Registration queued from `POST /auth/register` (processed by [`crate::auth::register_queue`]).
pub const JOB_TYPE_AUTH_REGISTER: &str = "auth_register";

/// Hard cap on wall-clock time for one `run_one_job` task (panic/ hang safety net).
const RUN_ONE_JOB_WALL_TIMEOUT: Duration = Duration::from_secs(600);

/// If a row stays `processing` longer than this, assume a crashed worker or lost task and mark failed.
/// `github_link_metadata` is excluded (can wait on rate limits).
const STALE_PROCESSING_AFTER_MINUTES: i32 = 3;

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
        entity_creates::JOB_TYPE_EMPLOYEE_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_UPDATE,
        entity_creates::JOB_TYPE_EMPLOYEE_DELETE,
        entity_creates::JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT,
        entity_creates::JOB_TYPE_EMPLOYEE_ASSET_ASSIGN,
        entity_creates::JOB_TYPE_EMPLOYEE_SKILL_UPSERT,
        entity_creates::JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT,
        entity_creates::JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_GOAL_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE,
        entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE,
        entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE,
        entity_creates::JOB_TYPE_DEPARTMENT_CREATE,
        entity_creates::JOB_TYPE_DEPARTMENT_UPDATE,
        entity_creates::JOB_TYPE_DEPARTMENT_DELETE,
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

async fn mark_job_failed(pool: &PgPool, job_id: &str, msg: &str) {
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

/// Fails jobs stuck in `processing` (e.g. process crash or task panic before `mark_job_failed`).
/// Excludes long-running GitHub metadata and auth login/register rows (updated by auth retry loops).
pub(super) async fn reclaim_stale_processing_jobs(pool: &PgPool) {
    let res = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'failed',
               error_message = 'Job stalled in processing (reclaimed by worker)',
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE status = 'processing'
             AND started_at IS NOT NULL
             AND started_at < clock_timestamp() - ($1::integer * interval '1 minute')
             AND job_type NOT IN ('github_link_metadata', 'auth_login', 'auth_register')"#,
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
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    job_id: String,
    job_type: String,
    payload: serde_json::Value,
    created_by_user_id: Option<String>,
) {
    match job_type.as_str() {
        JOB_TYPE_GITHUB_LINK_METADATA => {
            if let Some(link_id) = payload_link_id(&payload) {
                let _ = github_metadata::execute_github_link_metadata_job(
                    pool,
                    client,
                    &github_rate,
                    &job_id,
                    &link_id,
                )
                .await;
            } else {
                mark_job_failed(&pool, &job_id, "Missing payload.link_id").await;
            }
        }
        JOB_TYPE_QR_LOGIN_APPROVE => {
            crate::auth::qr_login_execute::execute_qr_login_approve_job(
                pool,
                &job_id,
                &payload,
                created_by_user_id.as_deref(),
            )
            .await;
        }
        JOB_TYPE_QR_LOGIN_FINALIZE => {
            crate::auth::qr_finalize_queue::execute_qr_login_finalize_job(pool, &job_id, &payload)
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
        | entity_creates::JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT
        | entity_creates::JOB_TYPE_EMPLOYEE_ASSET_ASSIGN
        | entity_creates::JOB_TYPE_EMPLOYEE_SKILL_UPSERT
        | entity_creates::JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT
        | entity_creates::JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_GOAL_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE
        | entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE
        | entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE
        | entity_creates::JOB_TYPE_DEPARTMENT_CREATE
        | entity_creates::JOB_TYPE_DEPARTMENT_UPDATE
        | entity_creates::JOB_TYPE_DEPARTMENT_DELETE => {
            entity_creates::run_entity_create_job(
                pool,
                client,
                &mutation_broker,
                &job_id,
                &job_type,
                &payload,
            )
            .await;
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

async fn run_one_job_supervised(
    pool: PgPool,
    client: Client,
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    job_id: String,
    job_type: String,
    payload: serde_json::Value,
    created_by_user_id: Option<String>,
    budgets: Arc<TypeBudgets>,
) {
    let job_id_for_log = job_id.clone();
    let job_type_for_log = job_type.clone();
    let pool_fail = pool.clone();

    let inner = tokio::spawn(async move {
        let _slot = BudgetReleaseOnDrop::new(budgets, job_type.clone());
        run_one_job(
            &pool,
            &client,
            github_rate,
            mutation_broker,
            job_id,
            job_type,
            payload,
            created_by_user_id,
        )
        .await;
    });

    let abort = inner.abort_handle();
    match tokio::time::timeout(RUN_ONE_JOB_WALL_TIMEOUT, inner).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            if e.is_panic() {
                error!(
                    target: "jobs",
                    event = "jobs.job_panic",
                    job_id = %job_id_for_log,
                    job_type = %job_type_for_log,
                    "background job task panicked"
                );
                mark_job_failed(
                    &pool_fail,
                    &job_id_for_log,
                    "Internal error: background job panicked",
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
                "background job exceeded wall-clock limit"
            );
            mark_job_failed(
                &pool_fail,
                &job_id_for_log,
                "Background job exceeded maximum processing time",
            )
            .await;
        }
    }
}

/// Atomically claims the next eligible row using `FOR UPDATE SKIP LOCKED` so concurrent workers
/// never block waiting on another transaction's lock; if the per-type budget rejects the job,
/// the row is returned to `pending` with a short `run_after` deferral so the same worker does not
/// spin on an ineligible head-of-queue row.
async fn try_claim_next(
    pool: &PgPool,
    budgets: &TypeBudgets,
) -> Option<(String, String, serde_json::Value, Option<String>)> {
    const MAX_TRIES: u32 = 48;
    for _ in 0..MAX_TRIES {
        let row = match sqlx::query(
            r#"UPDATE background_jobs AS b
               SET status = 'processing',
                   started_at = clock_timestamp(),
                   updated_at = clock_timestamp()
               FROM (
                 SELECT bi.id
                 FROM background_jobs bi
                 WHERE bi.status = 'pending'
                   AND (bi.run_after IS NULL OR bi.run_after <= clock_timestamp())
                 ORDER BY bi.priority DESC, bi.created_at ASC
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
               ) AS picked
               WHERE b.id = picked.id
                 AND b.status = 'pending'
                 AND (b.run_after IS NULL OR b.run_after <= clock_timestamp())
               RETURNING b.id, b.job_type, b.payload, b.created_by_user_id"#,
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

        if !budgets.try_acquire(&job_type) {
            debug!(
                target: "jobs",
                event = "jobs.budget_reject",
                job_id = %id,
                job_type = %job_type,
                "per-type concurrency or start interval; row deferred (75ms)"
            );
            let _ = sqlx::query(
                r#"UPDATE background_jobs
                   SET status = 'pending',
                       started_at = NULL,
                       run_after = clock_timestamp() + interval '75 milliseconds',
                       updated_at = clock_timestamp()
                   WHERE id = $1 AND status = 'processing'"#,
            )
            .bind(&id)
            .execute(pool)
            .await;
            continue;
        }

        return Some((id, job_type, payload, created_by));
    }
    None
}

/// One dequeue/spawn loop; `budgets` and `github_rate` are shared across all dispatchers in the process.
pub(super) async fn run_job_queue_dispatcher_loop(
    pool: PgPool,
    client: Client,
    github_rate: Arc<GithubRestRateLimit>,
    mutation_broker: MutationBroker,
    budgets: Arc<TypeBudgets>,
    worker_id: u64,
    logs: Arc<supervisor::WorkerLogRegistry>,
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
    /// Sweep stale `processing` rows roughly every minute.
    const STALE_RECLAIM_INTERVAL: Duration = Duration::from_secs(60);
    let mut sleep_ms = IDLE_SLEEP_MIN_MS;
    let mut last_stale_reclaim = Instant::now();

    loop {
        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
        if last_stale_reclaim.elapsed() >= STALE_RECLAIM_INTERVAL {
            reclaim_stale_processing_jobs(&pool).await;
            last_stale_reclaim = Instant::now();
        }

        let mut claimed_this_wake = 0u32;
        while claimed_this_wake < MAX_CLAIMS_PER_WAKE {
            let Some((job_id, job_type, payload, created_by_user_id)) =
                try_claim_next(&pool, &budgets).await
            else {
                break;
            };
            claimed_this_wake += 1;
            let pool = pool.clone();
            let client = client.clone();
            let budgets = budgets.clone();
            let gh_rate = github_rate.clone();
            let mutation_broker = mutation_broker.clone();
            let job_id_for_log = job_id.clone();
            let job_type_for_log = job_type.clone();
            tokio::spawn(async move {
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
                    budgets,
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
pub fn spawn_job_queue_worker(
    pool: PgPool,
    config: AppConfig,
    mutation_broker: MutationBroker,
) -> Arc<supervisor::JobWorkerSupervisor> {
    let n = config.job_queue_worker_count;
    spawn_job_queue_supervisor(pool, config, mutation_broker, n, n)
}
