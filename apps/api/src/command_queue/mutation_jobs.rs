//! When a queued mutation hits a transient database error, accept the work like auth login/register:
//! return HTTP 202 + `job_id`, retry in the background, and expose `GET …/mutation-jobs/{job_id}`.

// Human: When the mutation broker surfaces a transient DB error, we keep the client contract by polling a job id instead of blocking the HTTP thread for 30s of retries.
// Agent: run_mutation_defer SPAWNS mutation_db_retry_loop; MutationJobs Mutex tracks per job_id user_id; get_status_for_user enforces owner.

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use sqlx::PgPool;
use tokio::sync::Mutex as AsyncMutex;
use tracing::{info, warn};

use crate::auth::register_queue::new_job_id;
use crate::error::AppError;

use super::{JsonMutationResult, MutationBroker, MutationRunContext};

/// Wall-clock time the API keeps retrying a deferred mutation (matches login/register).
pub const MUTATION_DB_RETRY_MAX: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
pub struct MutationQueuedResponse {
    pub message: String,
    pub queued: bool,
    pub job_id: String,
    pub retry_deadline_secs: u32,
    /// When set, the work is tracked in `background_jobs` under this `job_type` (admin Jobs page).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_type: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MutationJobStatusKind {
    Pending,
    Completed,
    Failed,
}

#[derive(Debug, Serialize)]
pub struct MutationJobStatusResponse {
    pub status: MutationJobStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
}

#[derive(Clone, Default)]
pub struct MutationJobs(Arc<Mutex<HashMap<String, MutationJobRecord>>>);

struct MutationJobRecord {
    user_id: String,
    state: MutationJobState,
}

enum MutationJobState {
    Pending,
    Done(MutationJobStatusKind, MutationJobOutcome),
}

struct MutationJobOutcome {
    message: Option<String>,
    http_status: Option<u16>,
    body: Option<serde_json::Value>,
}

// Human: Status polling is keyed by job id but must not leak other users’ outcomes, so each record carries the owning `user_id`.
// Agent: Mutex HashMap job_id MutationJobRecord; insert_pending; set_completed/set_failed mutate state; get_status_for_user CHECKS user_id equality.

impl MutationJobs {
    pub fn insert_pending(&self, job_id: String, user_id: String) {
        let mut map = self.0.lock().expect("mutation_jobs mutex");
        map.insert(
            job_id,
            MutationJobRecord {
                user_id,
                state: MutationJobState::Pending,
            },
        );
    }

    pub fn set_completed(&self, job_id: &str, result: JsonMutationResult) {
        let mut map = self.0.lock().expect("mutation_jobs mutex");
        if let Some(rec) = map.get_mut(job_id) {
            rec.state = MutationJobState::Done(
                MutationJobStatusKind::Completed,
                MutationJobOutcome {
                    message: None,
                    http_status: Some(result.status.as_u16()),
                    body: Some(result.body),
                },
            );
        }
    }

    pub fn set_failed(&self, job_id: &str, message: String) {
        let mut map = self.0.lock().expect("mutation_jobs mutex");
        if let Some(rec) = map.get_mut(job_id) {
            rec.state = MutationJobState::Done(
                MutationJobStatusKind::Failed,
                MutationJobOutcome {
                    message: Some(message),
                    http_status: None,
                    body: None,
                },
            );
        }
    }

    pub fn get_status_for_user(
        &self,
        job_id: &str,
        user_id: &str,
    ) -> Option<MutationJobStatusResponse> {
        let map = self.0.lock().expect("mutation_jobs mutex");
        let rec = map.get(job_id)?;
        if rec.user_id != user_id {
            return None;
        }
        Some(match &rec.state {
            MutationJobState::Pending => MutationJobStatusResponse {
                status: MutationJobStatusKind::Pending,
                message: Some(
                    "Mutation is still processing (retries if the database was briefly unavailable)."
                        .into(),
                ),
                http_status: None,
                body: None,
            },
            MutationJobState::Done(kind, out) => MutationJobStatusResponse {
                status: *kind,
                message: out.message.clone(),
                http_status: out.http_status,
                body: out.body.clone(),
            },
        })
    }
}

pub enum MutationHandlerOutput {
    Ready(JsonMutationResult),
    Queued(MutationQueuedResponse),
}

/// Run a mutation once; on transient DB failure, enqueue background retries and return [`MutationHandlerOutput::Queued`].
// Human: `make_arc` rebuilds the closure for each retry attempt because the inner `FnOnce` semantics require a fresh future after each run.
// Agent: make_arc.lock await g(); broker.run ON Err transient_database spawn mutation_db_retry_loop RETURN Queued; ELSE propagate Err.

pub async fn run_mutation_defer<FMaker, F, Fut>(
    broker: MutationBroker,
    pool: PgPool,
    shard: String,
    ctx: MutationRunContext,
    jobs: MutationJobs,
    user_id: String,
    make_arc: Arc<AsyncMutex<FMaker>>,
) -> Result<MutationHandlerOutput, AppError>
where
    FMaker: FnMut() -> F + Send + 'static,
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: Future<Output = Result<JsonMutationResult, AppError>> + Send + 'static,
{
    let f = {
        let mut g = make_arc.lock().await;
        g()
    };
    match broker.run(shard.clone(), &pool, ctx.clone(), f).await {
        Ok(jr) => Ok(MutationHandlerOutput::Ready(jr)),
        Err(e) if e.transient_database => {
            let job_id = new_job_id();
            jobs.insert_pending(job_id.clone(), user_id.clone());
            info!(
                event = "mutation.deferred_db",
                job_id = %job_id,
                user_id = %user_id,
                shard = %shard,
                "mutation queued for DB retry (202 + poll)"
            );
            tokio::spawn(mutation_db_retry_loop(
                broker,
                pool,
                shard,
                ctx,
                jobs,
                job_id.clone(),
                make_arc,
            ));
            Ok(MutationHandlerOutput::Queued(MutationQueuedResponse {
                message: "Change is processing in the background (including automatic retries if the database was briefly unavailable). Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
                    .into(),
                queued: true,
                job_id,
                retry_deadline_secs: MUTATION_DB_RETRY_MAX.as_secs() as u32,
                job_type: None,
            }))
        }
        Err(e) => Err(e),
    }
}

// Human: Same deadline pattern as auth queues: sleep 400ms between transient failures until success or timeout message for the poller.
// Agent: LOOP deadline MUTATION_DB_RETRY_MAX; broker.run shard ctx; ON transient sleep; ON Ok set_completed BREAK; ON fatal set_failed BREAK.

async fn mutation_db_retry_loop<FMaker, F, Fut>(
    broker: MutationBroker,
    pool: PgPool,
    shard: String,
    ctx: MutationRunContext,
    jobs: MutationJobs,
    job_id: String,
    make_arc: Arc<AsyncMutex<FMaker>>,
) where
    FMaker: FnMut() -> F + Send + 'static,
    F: FnOnce(PgPool) -> Fut + Send + 'static,
    Fut: Future<Output = Result<JsonMutationResult, AppError>> + Send + 'static,
{
    let deadline = tokio::time::Instant::now() + MUTATION_DB_RETRY_MAX;
    loop {
        if tokio::time::Instant::now() >= deadline {
            warn!(
                event = "mutation.queue_timeout",
                job_id = %job_id,
                "mutation job timed out waiting for database"
            );
            jobs.set_failed(
                &job_id,
                "The database did not become available in time. Please try again.".into(),
            );
            break;
        }

        let f = {
            let mut g = make_arc.lock().await;
            g()
        };

        match broker.run(shard.clone(), &pool, ctx.clone(), f).await {
            Ok(jr) => {
                info!(
                    event = "mutation.queue_success",
                    job_id = %job_id,
                    "deferred mutation completed"
                );
                jobs.set_completed(&job_id, jr);
                break;
            }
            Err(e) if e.transient_database => {
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
            Err(e) => {
                jobs.set_failed(&job_id, e.message);
                break;
            }
        }
    }
}
