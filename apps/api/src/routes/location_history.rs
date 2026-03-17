use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/location-history", get(list_locations))
}

#[derive(Deserialize)]
struct LocationParams {
    q: Option<String>,
}

async fn list_locations(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<LocationParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let pattern = params
        .q
        .map(|q| format!("%{q}%"))
        .unwrap_or_else(|| "%".to_string());

    let rows = sqlx::query(
        r#"SELECT DISTINCT address FROM location_history
           WHERE user_id = $1 AND address ILIKE $2
           ORDER BY address ASC LIMIT 50"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.pool)
    .await?;

    let addresses: Vec<String> = rows.iter().map(|r| r.get("address")).collect();

    Ok(Json(serde_json::json!({ "locations": addresses })))
}
