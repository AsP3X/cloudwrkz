use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};

use crate::auth::extractors::AuthUser;
use crate::command_queue::MutationJobStatusResponse;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/mutation-jobs/{job_id}", get(mutation_job_status))
}

async fn mutation_job_status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(job_id): Path<String>,
) -> Result<Json<MutationJobStatusResponse>, AppError> {
    state
        .mutation_jobs
        .get_status_for_user(&job_id, &user.id)
        .map(Json)
        .ok_or_else(|| AppError::not_found("Unknown or expired mutation job"))
}
