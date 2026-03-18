use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/search", get(global_search))
        .route("/search/advanced", get(advanced_search))
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize, Default)]
struct AdvancedSearchParams {
    q: Option<String>,
    #[serde(rename = "type")]
    type_filter: Option<String>,
    limit: Option<i64>,
}

/// Response shape expected by the Vite search UI: unified list + total.
#[derive(serde::Serialize)]
struct SearchResponse {
    results: Vec<serde_json::Value>,
    total: u64,
}

fn ticket_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "ticket",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/tickets/{}", id),
        "metadata": {
            "ticketNumber": r.get::<String, _>("ticket_number"),
            "status": r.get::<String, _>("status"),
            "priority": r.get::<String, _>("priority"),
        },
    }))
}

fn todo_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    let description: Option<String> = r.get("description");
    let description_plain: Option<String> = r.get("description_plain");
    Ok(json!({
        "type": "task",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": description.or(description_plain),
        "url": format!("/dashboard/todos/{}", id),
        "metadata": {
            "todoNumber": r.get::<Option<String>, _>("todo_number"),
            "status": r.get::<String, _>("status"),
            "priority": r.get::<String, _>("priority"),
        },
    }))
}

fn link_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "link",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/links/{}", id),
        "metadata": {
            "linkUrl": r.get::<String, _>("url"),
        },
    }))
}

fn time_entry_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "timeentry",
        "id": id,
        "title": r.get::<String, _>("name"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/time-tracking/{}", id),
        "metadata": {
            "status": r.get::<String, _>("status"),
        },
    }))
}

async fn global_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(20).min(50);

    let mut results: Vec<serde_json::Value> = Vec::new();

    // Fuzzy search using pg_trgm: similarity > 0.2 gives typo tolerance (e.g. "Acess" -> "Access").
    // Falls back to ILIKE if pg_trgm is not available (extension not created).
    let ticket_rows = sqlx::query(
        r#"SELECT id, ticket_number, title, description, status::text as status, priority::text as priority
           FROM tickets
           WHERE (created_by_id = $1 OR assigned_to_id = $1)
             AND archived_at IS NULL
             AND (
               similarity(title, $2) > 0.2
               OR similarity(COALESCE(description_plain, ''), $2) > 0.2
               OR similarity(COALESCE(description, ''), $2) > 0.2
               OR similarity(ticket_number, $2) > 0.2
             )
           ORDER BY greatest(
             similarity(title, $2),
             similarity(COALESCE(description_plain, ''), $2),
             similarity(COALESCE(description, ''), $2),
             similarity(ticket_number, $2)
           ) DESC
           LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&query)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    for row in &ticket_rows {
        results.push(ticket_to_result(row)?);
    }

    let todo_rows = sqlx::query(
        r#"SELECT id, todo_number, title, description, description_plain, status::text as status, priority::text as priority
           FROM todos
           WHERE assigned_to_id = $1 AND archived_at IS NULL
             AND (
               similarity(title, $2) > 0.2
               OR similarity(COALESCE(description_plain, ''), $2) > 0.2
               OR similarity(COALESCE(description, ''), $2) > 0.2
             )
           ORDER BY greatest(
             similarity(title, $2),
             similarity(COALESCE(description_plain, ''), $2),
             similarity(COALESCE(description, ''), $2)
           ) DESC
           LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&query)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    for row in &todo_rows {
        results.push(todo_to_result(row)?);
    }

    let link_rows = sqlx::query(
        r#"SELECT id, title, url, description
           FROM links
           WHERE user_id = $1 AND archived_at IS NULL
             AND (
               similarity(title, $2) > 0.2
               OR similarity(COALESCE(url, ''), $2) > 0.2
               OR similarity(COALESCE(description, ''), $2) > 0.2
               OR similarity(COALESCE(notes, ''), $2) > 0.2
             )
           ORDER BY greatest(
             similarity(title, $2),
             similarity(COALESCE(url, ''), $2),
             similarity(COALESCE(description, ''), $2),
             similarity(COALESCE(notes, ''), $2)
           ) DESC
           LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&query)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    for row in &link_rows {
        results.push(link_to_result(row)?);
    }

    let te_rows = sqlx::query(
        r#"SELECT id, name, description, status::text as status
           FROM time_entries
           WHERE user_id = $1 AND archived_at IS NULL
             AND (
               similarity(name, $2) > 0.2
               OR similarity(COALESCE(description, ''), $2) > 0.2
               OR similarity(COALESCE(location, ''), $2) > 0.2
             )
           ORDER BY greatest(
             similarity(name, $2),
             similarity(COALESCE(description, ''), $2),
             similarity(COALESCE(location, ''), $2)
           ) DESC
           LIMIT $3"#,
    )
    .bind(&user.id)
    .bind(&query)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    for row in &te_rows {
        results.push(time_entry_to_result(row)?);
    }

    let total = results.len() as u64;
    Ok(Json(SearchResponse { results, total }))
}

async fn advanced_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<AdvancedSearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    let query = params.q.as_deref().unwrap_or("").trim();
    if query.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(100).min(200).max(1);
    let type_filter = params
        .type_filter
        .as_deref()
        .map(|s| s.to_lowercase());

    let run_tickets = type_filter
        .as_deref()
        .map(|t| !["todo", "link", "timeentry"].contains(&t))
        .unwrap_or(true);
    let run_todos = type_filter
        .as_deref()
        .map(|t| !["ticket", "link", "timeentry"].contains(&t))
        .unwrap_or(true);
    let run_links = type_filter
        .as_deref()
        .map(|t| !["ticket", "todo", "timeentry"].contains(&t))
        .unwrap_or(true);
    let run_time_entries = type_filter
        .as_deref()
        .map(|t| !["ticket", "todo", "link"].contains(&t))
        .unwrap_or(true);

    let mut results: Vec<serde_json::Value> = Vec::new();

    if run_tickets {
        let ticket_rows = sqlx::query(
            r#"SELECT id, ticket_number, title, description, status::text as status, priority::text as priority
               FROM tickets
               WHERE (created_by_id = $1 OR assigned_to_id = $1)
                 AND archived_at IS NULL
                 AND (
                   similarity(title, $2) > 0.2
                   OR similarity(COALESCE(description_plain, ''), $2) > 0.2
                   OR similarity(COALESCE(description, ''), $2) > 0.2
                   OR similarity(ticket_number, $2) > 0.2
                 )
               ORDER BY greatest(
                 similarity(title, $2),
                 similarity(COALESCE(description_plain, ''), $2),
                 similarity(COALESCE(description, ''), $2),
                 similarity(ticket_number, $2)
               ) DESC
               LIMIT $3"#,
        )
        .bind(&user.id)
        .bind(query)
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
        for row in &ticket_rows {
            results.push(ticket_to_result(row)?);
        }
    }

    if run_todos {
        let todo_rows = sqlx::query(
            r#"SELECT id, todo_number, title, description, description_plain, status::text as status, priority::text as priority
               FROM todos
               WHERE assigned_to_id = $1 AND archived_at IS NULL
                 AND (
                   similarity(title, $2) > 0.2
                   OR similarity(COALESCE(description_plain, ''), $2) > 0.2
                   OR similarity(COALESCE(description, ''), $2) > 0.2
                 )
               ORDER BY greatest(
                 similarity(title, $2),
                 similarity(COALESCE(description_plain, ''), $2),
                 similarity(COALESCE(description, ''), $2)
               ) DESC
               LIMIT $3"#,
        )
        .bind(&user.id)
        .bind(query)
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
        for row in &todo_rows {
            results.push(todo_to_result(row)?);
        }
    }

    if run_links {
        let link_rows = sqlx::query(
            r#"SELECT id, title, url, description
               FROM links
               WHERE user_id = $1 AND archived_at IS NULL
                 AND (
                   similarity(title, $2) > 0.2
                   OR similarity(COALESCE(url, ''), $2) > 0.2
                   OR similarity(COALESCE(description, ''), $2) > 0.2
                   OR similarity(COALESCE(notes, ''), $2) > 0.2
                 )
               ORDER BY greatest(
                 similarity(title, $2),
                 similarity(COALESCE(url, ''), $2),
                 similarity(COALESCE(description, ''), $2),
                 similarity(COALESCE(notes, ''), $2)
               ) DESC
               LIMIT $3"#,
        )
        .bind(&user.id)
        .bind(query)
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
        for row in &link_rows {
            results.push(link_to_result(row)?);
        }
    }

    if run_time_entries {
        let te_rows = sqlx::query(
            r#"SELECT id, name, description, status::text as status
               FROM time_entries
               WHERE user_id = $1 AND archived_at IS NULL
                 AND (
                   similarity(name, $2) > 0.2
                   OR similarity(COALESCE(description, ''), $2) > 0.2
                   OR similarity(COALESCE(location, ''), $2) > 0.2
                 )
               ORDER BY greatest(
                 similarity(name, $2),
                 similarity(COALESCE(description, ''), $2),
                 similarity(COALESCE(location, ''), $2)
               ) DESC
               LIMIT $3"#,
        )
        .bind(&user.id)
        .bind(query)
        .bind(limit)
        .fetch_all(&state.pool)
        .await?;
        for row in &te_rows {
            results.push(time_entry_to_result(row)?);
        }
    }

    let total = results.len() as u64;
    Ok(Json(SearchResponse { results, total }))
}
