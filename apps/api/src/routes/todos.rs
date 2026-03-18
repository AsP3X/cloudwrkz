use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::todo::*;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/todos", get(list_todos).post(create_todo))
        .route(
            "/todos/{id}",
            get(get_todo)
                .patch(update_todo)
                .delete(delete_todo),
        )
}

fn row_to_item(r: &sqlx::postgres::PgRow) -> TodoListItem {
    TodoListItem {
        id: r.get("id"),
        todo_number: r.get("todo_number"),
        parent_todo_id: r.get("parent_todo_id"),
        title: r.get("title"),
        description: r.get("description"),
        description_html: r.get("description_html"),
        description_plain: r.get("description_plain"),
        status: r.get("status"),
        priority: r.get("priority"),
        assigned_to_id: r.get("assigned_to_id"),
        estimated_hours: r.get("estimated_hours"),
        actual_hours: r.get("actual_hours"),
        start_date: r.get("start_date"),
        due_date: r.get("due_date"),
        completed_date: r.get("completed_date"),
        archived_at: r.get("archived_at"),
        ticket_id: r.get("ticket_id"),
        order: r.get("order"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        assigned_to: None,
        subtodos: vec![],
    }
}

const TODO_SELECT: &str = r#"SELECT id, todo_number, parent_todo_id, title, description,
       description_html, description_plain, status::text as status, priority::text as priority,
       assigned_to_id, estimated_hours, actual_hours, start_date, due_date,
       completed_date, archived_at, ticket_id, "order", created_at, updated_at"#;

async fn list_todos(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TodoListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let archive = params.archive.as_deref().unwrap_or("unarchived");
    let priority = params.priority.clone();
    let is_root_only = params.kind.as_deref() == Some("root");

    let statuses: Vec<String> = params
        .status
        .as_deref()
        .map(|s| s.split(',').map(|v| v.trim().to_string()).collect())
        .unwrap_or_default();

    let mut sql = format!(
        "{TODO_SELECT} FROM todos
         WHERE assigned_to_id = $1
           AND ($2::text IS NULL OR priority::text = $2)
           AND (($3 = 'archived' AND archived_at IS NOT NULL) OR ($3 != 'archived' AND archived_at IS NULL))"
    );

    if !statuses.is_empty() {
        let placeholders: Vec<String> = statuses
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 4))
            .collect();
        sql.push_str(&format!(
            " AND status::text IN ({})",
            placeholders.join(", ")
        ));
    }

    if is_root_only {
        sql.push_str(" AND parent_todo_id IS NULL");
    }

    sql.push_str(" ORDER BY created_at DESC");

    if let Some(limit) = params.limit {
        sql.push_str(&format!(" LIMIT {}", limit.max(0)));
    }

    let mut query = sqlx::query(&sql)
        .bind(&user.id)
        .bind(&priority)
        .bind(archive);

    for s in &statuses {
        query = query.bind(s);
    }

    let rows = query.fetch_all(&state.pool).await?;

    let todos: Vec<TodoListItem> = rows.iter().map(row_to_item).collect();
    Ok(Json(serde_json::json!({ "todos": todos })))
}

async fn get_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sql = format!("{TODO_SELECT} FROM todos WHERE id = $1 AND assigned_to_id = $2");
    let row = sqlx::query(&sql)
        .bind(&id)
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Todo not found"))?;

    let subtodo_sql = format!(
        "{TODO_SELECT} FROM todos WHERE parent_todo_id = $1 ORDER BY \"order\" ASC, created_at ASC"
    );
    let subtodo_rows = sqlx::query(&subtodo_sql)
        .bind(&id)
        .fetch_all(&state.pool)
        .await?;

    let mut todo = row_to_item(&row);
    todo.subtodos = subtodo_rows.iter().map(row_to_item).collect();

    Ok(Json(serde_json::json!({ "todo": todo })))
}

async fn create_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateTodoRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Title is required"));
    }

    let id = crate::id::new_cuid();
    let status = body.status.as_deref().unwrap_or("NOT_STARTED");
    let priority = body.priority.as_deref().unwrap_or("MEDIUM");
    let assigned_to = body.assigned_to_id.as_deref().unwrap_or(&user.id);

    sqlx::query(
        r#"INSERT INTO todos (id, title, description, description_html,
                              status, priority, assigned_to_id, parent_todo_id,
                              ticket_id, estimated_hours, "order", created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::"TodoStatus", $6::"TodoPriority",
                   $7, $8, $9, $10, 0, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(body.title.trim())
    .bind(&body.description)
    .bind(&body.description_html)
    .bind(status)
    .bind(priority)
    .bind(assigned_to)
    .bind(&body.parent_todo_id)
    .bind(&body.ticket_id)
    .bind(body.estimated_hours)
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

async fn update_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateTodoRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Todo not found"))?;

    let owner: Option<String> = existing.get("assigned_to_id");
    if owner.as_deref() != Some(&user.id) {
        return Err(AppError::forbidden("Not your todo"));
    }

    if let Some(ref title) = body.title {
        sqlx::query("UPDATE todos SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref desc) = body.description {
        sqlx::query("UPDATE todos SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(desc)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref status) = body.status {
        let completed_date = if status == "COMPLETED" {
            Some(chrono::Utc::now().naive_utc())
        } else {
            None
        };
        sqlx::query(
            r#"UPDATE todos SET status = $1::"TodoStatus", completed_date = $2, updated_at = NOW() WHERE id = $3"#,
        )
        .bind(status)
        .bind(completed_date)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    }
    if let Some(ref priority) = body.priority {
        sqlx::query(
            r#"UPDATE todos SET priority = $1::"TodoPriority", updated_at = NOW() WHERE id = $2"#,
        )
        .bind(priority)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    }
    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            sqlx::query("UPDATE todos SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                .bind(&id)
                .execute(&state.pool)
                .await?;
        } else {
            sqlx::query("UPDATE todos SET archived_at = NOW(), updated_at = NOW() WHERE id = $1")
                .bind(&id)
                .execute(&state.pool)
                .await?;
        }
    }
    if let Some(order) = body.order {
        sqlx::query("UPDATE todos SET \"order\" = $1, updated_at = NOW() WHERE id = $2")
            .bind(order)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Todo updated" }),
    ))
}

async fn delete_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Todo not found"))?;

    let owner: Option<String> = existing.get("assigned_to_id");
    if owner.as_deref() != Some(&user.id) {
        return Err(AppError::forbidden("Not your todo"));
    }

    sqlx::query("DELETE FROM todos WHERE parent_todo_id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    sqlx::query("DELETE FROM todos WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Todo deleted" }),
    ))
}
