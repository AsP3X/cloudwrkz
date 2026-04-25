// Human: Saved filter presets are not persisted server-side yet; these routes exist so the client can call a uniform API and fall back to localStorage.
// Agent: GET /filter-preferences/{module} returns empty filters; GET .../presets returns empty presets + blank lastUsedPresetId; REQUIRES AuthUser.

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
    // Human: The module path is accepted for forward compatibility even though the stub always returns an empty filter object.
    // Agent: IGNORES module string; RETURNS JSON { filters: {} }; HTTP 200.

    Ok(Json(serde_json::json!({ "filters": {} })))
}

async fn get_presets(
    AuthUser(_user): AuthUser,
    Path(_module): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Human: Preset lists will eventually be per-module; today the shape matches the client contract with empty arrays.
    // Agent: IGNORES module; RETURNS presets [] and lastUsedPresetId "".

    Ok(Json(serde_json::json!({
        "presets": [],
        "lastUsedPresetId": ""
    })))
}
