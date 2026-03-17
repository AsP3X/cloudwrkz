use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::helpers::check_permission;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/audit/events", get(audit_events))
        .route("/admin/db-query", post(db_query))
        .route("/admin/purge-deleted-accounts", post(purge_deleted))
}

async fn audit_events(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let rows = sqlx::query(
        r#"SELECT id, user_id, action, resource_type, resource_id,
                  context, ip_address, user_agent, created_at
           FROM audit_logs ORDER BY created_at DESC LIMIT 200"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let events: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "user_id": r.get::<Option<String>, _>("user_id"),
                "action": r.get::<String, _>("action"),
                "resource_type": r.get::<Option<String>, _>("resource_type"),
                "resource_id": r.get::<Option<String>, _>("resource_id"),
                "context": r.get::<Option<serde_json::Value>, _>("context"),
                "ip_address": r.get::<Option<String>, _>("ip_address"),
                "user_agent": r.get::<Option<String>, _>("user_agent"),
                "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "events": events })))
}

#[derive(Deserialize)]
struct DbQueryRequest {
    query: String,
}

async fn db_query(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<DbQueryRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "admin.db.view_entries").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let query = body.query.trim();
    if !query.to_uppercase().starts_with("SELECT") {
        return Err(AppError::bad_request("Only SELECT queries are allowed"));
    }

    let rows: Vec<serde_json::Value> = sqlx::query_scalar(&format!(
        "SELECT row_to_json(t) FROM ({query}) t LIMIT 1000"
    ))
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "rows": rows })))
}

async fn purge_deleted(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let cutoff = chrono::Utc::now().naive_utc() - chrono::Duration::days(30);
    let result = sqlx::query(
        "DELETE FROM users WHERE status = 'DELETED' AND scheduled_for_deletion_at IS NOT NULL AND scheduled_for_deletion_at < $1",
    )
    .bind(cutoff)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "purged": result.rows_affected(),
        "message": format!("Purged {} deleted accounts", result.rows_affected())
    })))
}
