// Stub routes for filter preferences until full backend is implemented.
// Frontend falls back to localStorage when these return empty data.

use axum::{Json, extract::Path};

use crate::auth::extractors::AuthUser;
use crate::error::AppError;

pub fn router() -> axum::Router<crate::routes::AppState> {
    axum::Router::new()
        .route(
            "/filter-preferences/{module}",
            axum::routing::get(get_preferences),
        )
        .route(
            "/filter-preferences/{module}/presets",
            axum::routing::get(get_presets),
        )
}

async fn get_preferences(
    AuthUser(_user): AuthUser,
    Path(_module): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({ "filters": {} })))
}

async fn get_presets(
    AuthUser(_user): AuthUser,
    Path(_module): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "presets": [],
        "lastUsedPresetId": ""
    })))
}
