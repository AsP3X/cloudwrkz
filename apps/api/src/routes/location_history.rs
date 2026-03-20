use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/location-history", get(list_locations).post(save_location))
}

#[derive(Deserialize)]
struct LocationParams {
    q: Option<String>,
}

#[derive(Deserialize)]
struct SaveLocationRequest {
    address: String,
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

async fn save_location(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SaveLocationRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let address = body.address.trim();
    if address.is_empty() {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Address is required" })),
        ));
    }

    sqlx::query(
        r#"INSERT INTO location_history (id, user_id, address)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, address)
           DO UPDATE SET updated_at = NOW()"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(address)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "saved": true })),
    ))
}
