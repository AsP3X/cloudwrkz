use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};

use crate::auth::extractors::AuthUser;
use crate::command_queue::MutationJobStatusResponse;
use crate::error::AppError;
use crate::job_queue::entity_creates;
use crate::routes::AppState;

// Human: Clients poll here after `202` mutation responses to learn whether a deferred DB write completed, failed, or is still pending.
// Agent: GET /mutation-jobs/{job_id}; AUTH user; TRY entity_creates job status ELSE in-memory MutationJobs map; NOT_FOUND if missing.

pub fn router() -> Router<AppState> {
    Router::new().route("/mutation-jobs/{job_id}", get(mutation_job_status))
}

async fn mutation_job_status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(job_id): Path<String>,
) -> Result<Json<MutationJobStatusResponse>, AppError> {
    // Human: Ticket-style async creates live in Postgres first; generic command-queue mutations may still live only in memory until completed.
    // Agent: CALLS try_entity_create_job_status_for_user; ON Some RETURN Json; ELSE mutation_jobs.get_status_for_user OR AppError::not_found.

    if let Some(st) =
        entity_creates::try_entity_create_job_status_for_user(&state.pool, &job_id, &user.id)
            .await?
    {
        return Ok(Json(st));
    }

    state
        .mutation_jobs
        .get_status_for_user(&job_id, &user.id)
        .map(Json)
        .ok_or_else(|| AppError::not_found("Unknown or expired mutation job"))
}
