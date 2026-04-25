// Human: Stub route for a unified archive list until the backend persists archived entities; the UI treats an empty `items` array as “nothing archived yet”.
// Agent: GET /archive under v1; REQUIRES AuthUser; RETURNS JSON { items: [] }; READS no database.

use axum::Json;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> axum::Router<AppState> {
    axum::Router::new().route("/archive", axum::routing::get(list_archive))
}

async fn list_archive(AuthUser(_user): AuthUser) -> Result<Json<serde_json::Value>, AppError> {
    // Human: Authentication is enforced so the route shape matches future list endpoints, even though the payload is still empty.
    // Agent: IGNORES user id today; RETURNS hard-coded empty items array; NO pool access.
    Ok(Json(serde_json::json!({ "items": [] })))
}
