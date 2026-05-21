// Human: Stub route for a unified archive list until the backend persists archived entities; the UI treats an empty `items` array as “nothing archived yet”.
// Agent: GET /archive under v1; REQUIRES AuthUser + archive.view; RETURNS JSON { items: [] }; READS no database.

use axum::extract::State;
use axum::Json;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::permissions;
use crate::routes::AppState;
use crate::routes::helpers::require_permission;

pub fn router() -> axum::Router<AppState> {
    axum::Router::new().route("/archive", axum::routing::get(list_archive))
}

async fn list_archive(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, permissions::key::ARCHIVE_VIEW).await?;
    // Human: Authentication is enforced so the route shape matches future list endpoints, even though the payload is still empty.
    // Agent: IGNORES user id today; RETURNS hard-coded empty items array; NO pool access beyond permission check.
    Ok(Json(serde_json::json!({ "items": [] })))
}
