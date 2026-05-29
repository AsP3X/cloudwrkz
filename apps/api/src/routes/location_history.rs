use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use crate::audit;
use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

// Human: Stores and suggests recent typed addresses (e.g. for time entry location fields) per authenticated user.
// Agent: ROUTER /location-history GET list + POST save; BOTH REQUIRE AuthUser; READS/WRITES location_history table.

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
    // Human: Autocomplete uses a substring filter; results are ordered by most recently used so repeat sites surface first.
    // Agent: READS location_history WHERE user_id AND address ILIKE pattern; pattern is %{q}% or '%'; ORDER BY updated_at DESC LIMIT 50.
    let pattern = params
        .q
        .map(|q| format!("%{q}%"))
        .unwrap_or_else(|| "%".to_string());

    let rows = sqlx::query(
        r#"SELECT address FROM location_history
           WHERE user_id = $1 AND address ILIKE $2
           ORDER BY updated_at DESC LIMIT 50"#,
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
    headers: HeaderMap,
    Json(body): Json<SaveLocationRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let address = body.address.trim();
    if address.is_empty() {
        // Human: Empty saves are validation failures and must use the standard `AppError` JSON shape expected by the Vite client.
        // Agent: RETURNS AppError::validation BAD_REQUEST code VALIDATION_ERROR; FIELDS address required marker; NO DB write.
        return Err(AppError::validation(
            "Address is required",
            serde_json::json!({ "address": ["required"] }),
        ));
    }

    // Human: Upsert keeps one row per user and normalized address while refreshing `updated_at` when the same address is saved again.
    // Agent: INSERT location_history ON CONFLICT (user_id, address) DO UPDATE updated_at NOW; BINDS new id uuid, user_id, trimmed address.
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

    audit::write_audit_from_headers(
        &state.pool,
        Some(user.id.clone()),
        "location_history.save",
        Some("location_history"),
        None,
        Some(serde_json::json!({ "address": address })),
        &headers,
    );

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "saved": true })),
    ))
}
