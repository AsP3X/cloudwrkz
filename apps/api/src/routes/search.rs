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
    Router::new().route("/search", get(global_search))
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    limit: Option<i64>,
}

async fn global_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Ok(Json(serde_json::json!({
            "tickets": [], "todos": [], "links": [], "timeEntries": []
        })));
    }

    let limit = params.limit.unwrap_or(10).min(50);
    let pattern = format!("%{query}%");

    let ticket_rows = sqlx::query(
        r#"SELECT id, ticket_number, title, status::text as status, priority::text as priority
           FROM tickets
           WHERE (created_by_id = $1 OR assigned_to_id = $1)
             AND archived_at IS NULL
             AND (title ILIKE $2 OR description ILIKE $2 OR description_plain ILIKE $2 OR ticket_number ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let tickets: Vec<serde_json::Value> = ticket_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "ticket_number": r.get::<String, _>("ticket_number"),
                "title": r.get::<String, _>("title"),
                "status": r.get::<String, _>("status"),
                "priority": r.get::<String, _>("priority"),
            })
        })
        .collect();

    let todo_rows = sqlx::query(
        r#"SELECT id, todo_number, title, status::text as status, priority::text as priority
           FROM todos
           WHERE assigned_to_id = $1 AND archived_at IS NULL
             AND (title ILIKE $2 OR description ILIKE $2 OR description_plain ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let todos: Vec<serde_json::Value> = todo_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "todo_number": r.get::<Option<String>, _>("todo_number"),
                "title": r.get::<String, _>("title"),
                "status": r.get::<String, _>("status"),
                "priority": r.get::<String, _>("priority"),
            })
        })
        .collect();

    let link_rows = sqlx::query(
        r#"SELECT id, title, url, description
           FROM links
           WHERE user_id = $1 AND archived_at IS NULL
             AND (title ILIKE $2 OR url ILIKE $2 OR description ILIKE $2 OR notes ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let links: Vec<serde_json::Value> = link_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "title": r.get::<String, _>("title"),
                "url": r.get::<String, _>("url"),
                "description": r.get::<Option<String>, _>("description"),
            })
        })
        .collect();

    let te_rows = sqlx::query(
        r#"SELECT id, name, description, status::text as status
           FROM time_entries
           WHERE user_id = $1 AND archived_at IS NULL
             AND (name ILIKE $2 OR description ILIKE $2 OR location ILIKE $2)
           ORDER BY updated_at DESC LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let time_entries: Vec<serde_json::Value> = te_rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "status": r.get::<String, _>("status"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "tickets": tickets,
        "todos": todos,
        "links": links,
        "timeEntries": time_entries,
    })))
}
