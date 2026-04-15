// Stub route for unified archive list until full backend is implemented.
// Frontend shows empty list when items is [].

use axum::Json;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> axum::Router<AppState> {
    axum::Router::new().route("/archive", axum::routing::get(list_archive))
}

async fn list_archive(AuthUser(_user): AuthUser) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({ "items": [] })))
}
