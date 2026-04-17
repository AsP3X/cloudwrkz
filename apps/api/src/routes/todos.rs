use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::get,
};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::command_queue::{
    JsonMutationResult, MutationRunContext, apply_mutation_tx_settings, mutation_response,
    run_mutation_defer,
};
use crate::db::numbering::next_todo_number;
use crate::error::AppError;
use crate::models::todo::{
    CreateTodoRequest, TodoDependencyItem, TodoDependsOnSummary, TodoListItem, TodoListParams,
    TodoParentSummary, TodoRow, TodoTicketSummary, UpdateTodoRequest,
};
use crate::routes::AppState;
use crate::routes::helpers::{
    check_permission, fetch_user_summary, hash_json_for_idempotency, idempotency_key_from_headers,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/todos", get(list_todos).post(create_todo))
        .route(
            "/todos/{id}",
            get(get_todo).patch(update_todo).delete(delete_todo),
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
        parent_todo: None,
        ticket: None,
        dependencies: vec![],
    }
}

fn todo_row_to_item(r: &TodoRow) -> TodoListItem {
    TodoListItem {
        id: r.id.clone(),
        todo_number: r.todo_number.clone(),
        parent_todo_id: r.parent_todo_id.clone(),
        title: r.title.clone(),
        description: r.description.clone(),
        description_html: r.description_html.clone(),
        description_plain: r.description_plain.clone(),
        status: r.status.clone(),
        priority: r.priority.clone(),
        assigned_to_id: r.assigned_to_id.clone(),
        estimated_hours: r.estimated_hours,
        actual_hours: r.actual_hours,
        start_date: r.start_date,
        due_date: r.due_date,
        completed_date: r.completed_date,
        archived_at: r.archived_at,
        ticket_id: r.ticket_id.clone(),
        order: r.order,
        created_at: r.created_at,
        updated_at: r.updated_at,
        assigned_to: None,
        subtodos: vec![],
        parent_todo: None,
        ticket: None,
        dependencies: vec![],
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
    let ticket_id = params.ticket_id.clone();
    let _ = &params.sort;

    if let Some(ref tid) = ticket_id {
        let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;
        let ticket = sqlx::query(
            "SELECT id, created_by_id, assigned_to_id FROM tickets WHERE id = $1
             AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3)",
        )
        .bind(tid)
        .bind(can_view_all)
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?;
        if ticket.is_none() {
            return Ok(Json(serde_json::json!({ "todos": [] })));
        }
    }

    let statuses: Vec<String> = params
        .status
        .as_deref()
        .map(|s| s.split(',').map(|v| v.trim().to_string()).collect())
        .unwrap_or_default();

    let mut sql = format!(
        "{TODO_SELECT} FROM todos
         WHERE ($1::text IS NULL OR assigned_to_id = $1)
           AND ($2::text IS NULL OR priority::text = $2)
           AND (($3 = 'archived' AND archived_at IS NOT NULL) OR ($3 != 'archived' AND archived_at IS NULL))"
    );
    let mut bind_count = 4u32;
    if ticket_id.is_some() {
        sql.push_str(&format!(" AND ticket_id = ${}", bind_count));
        bind_count += 1;
    }
    if !statuses.is_empty() {
        let placeholders: Vec<String> = statuses
            .iter()
            .enumerate()
            .map(|i| format!("${}", bind_count + i.0 as u32))
            .collect();
        sql.push_str(&format!(
            " AND status::text IN ({})",
            placeholders.join(", ")
        ));
    }
    if is_root_only {
        sql.push_str(&format!(" AND parent_todo_id IS NULL"));
    }
    sql.push_str(" ORDER BY \"order\" ASC, created_at ASC");

    if let Some(limit) = params.limit {
        sql.push_str(&format!(" LIMIT {}", limit.max(0)));
    }

    let assigned_filter = if ticket_id.is_some() {
        let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;
        if can_view_all {
            None
        } else {
            Some(user.id.clone())
        }
    } else {
        Some(user.id.clone())
    };

    let mut query = sqlx::query(&sql)
        .bind(&assigned_filter)
        .bind(&priority)
        .bind(archive);
    if let Some(ref tid) = ticket_id {
        query = query.bind(tid);
    }
    for s in &statuses {
        query = query.bind(s);
    }

    let rows = query.fetch_all(&state.pool).await?;

    let mut todos = Vec::with_capacity(rows.len());
    for r in &rows {
        let mut item = row_to_item(r);
        let assigned_to_id: Option<String> = r.get("assigned_to_id");
        if let Some(ref uid) = assigned_to_id {
            item.assigned_to = fetch_user_summary(&state.pool, uid).await;
        }
        todos.push(item);
    }
    Ok(Json(serde_json::json!({ "todos": todos })))
}

async fn get_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;
    let row: Option<TodoRow> = sqlx::query_as(&format!("{TODO_SELECT} FROM todos WHERE id = $1"))
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    let mut row = row.ok_or_else(|| AppError::not_found("Todo not found"))?;

    // Backfill todo_number for legacy todos that lack one (atomic sequence)
    if row.todo_number.is_none() {
        let num: Option<String> = sqlx::query_scalar(
            r#"UPDATE todos SET
                 todo_number = '#TDO-' || lpad(nextval('todo_number_seq')::text, 6, '0'),
                 updated_at = NOW()
               WHERE id = $1 AND todo_number IS NULL
               RETURNING todo_number"#,
        )
        .bind(&row.id)
        .fetch_optional(&state.pool)
        .await?;
        if let Some(n) = num {
            row.todo_number = Some(n);
        } else {
            row.todo_number = sqlx::query_scalar("SELECT todo_number FROM todos WHERE id = $1")
                .bind(&row.id)
                .fetch_optional(&state.pool)
                .await?;
        }
    }

    let owner = row.assigned_to_id.as_deref();
    let mut can_access = can_view_all || owner == Some(&user.id);
    if !can_access {
        if let Some(ref tid) = row.ticket_id {
            let t = sqlx::query("SELECT created_by_id, assigned_to_id FROM tickets WHERE id = $1")
                .bind(tid)
                .fetch_optional(&state.pool)
                .await?;
            if let Some(tr) = t {
                let created: Option<String> = tr.get("created_by_id");
                let assigned: Option<String> = tr.get("assigned_to_id");
                can_access =
                    created.as_deref() == Some(&user.id) || assigned.as_deref() == Some(&user.id);
            }
        }
    }
    if !can_access {
        return Err(AppError::forbidden("Not allowed to view this todo"));
    }

    let subtodo_sql = format!(
        "{TODO_SELECT} FROM todos WHERE parent_todo_id = $1 ORDER BY \"order\" ASC, created_at ASC"
    );
    let subtodo_rows: Vec<TodoRow> = sqlx::query_as(&subtodo_sql)
        .bind(&id)
        .fetch_all(&state.pool)
        .await?;

    let mut todo = todo_row_to_item(&row);
    todo.assigned_to = match &row.assigned_to_id {
        Some(uid) => fetch_user_summary(&state.pool, uid).await,
        None => None,
    };
    let mut subtodos = Vec::with_capacity(subtodo_rows.len());
    for sr in &subtodo_rows {
        let mut st = todo_row_to_item(sr);
        st.assigned_to = match &sr.assigned_to_id {
            Some(uid) => fetch_user_summary(&state.pool, uid).await,
            None => None,
        };
        subtodos.push(st);
    }
    todo.subtodos = subtodos;

    if let Some(ref pid) = todo.parent_todo_id {
        if let Some(parent_row) =
            sqlx::query_as::<_, (String, String)>("SELECT id, title FROM todos WHERE id = $1")
                .bind(pid)
                .fetch_optional(&state.pool)
                .await?
        {
            todo.parent_todo = Some(TodoParentSummary {
                id: parent_row.0,
                title: parent_row.1,
            });
        }
    }
    if let Some(ref tid) = todo.ticket_id {
        if let Some(ticket_row) = sqlx::query_as::<_, (String, String, String)>(
            "SELECT id, ticket_number, title FROM tickets WHERE id = $1",
        )
        .bind(tid)
        .fetch_optional(&state.pool)
        .await?
        {
            todo.ticket = Some(TodoTicketSummary {
                id: ticket_row.0,
                ticket_number: ticket_row.1,
                title: ticket_row.2,
            });
        }
    }
    let dep_rows: Vec<(String, String, String)> = sqlx::query_as(
        r#"SELECT t.id, t.title, t.status
           FROM todo_dependencies d
           JOIN todos t ON t.id = d.depends_on_todo_id
           WHERE d.todo_id = $1"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    todo.dependencies = dep_rows
        .into_iter()
        .map(|(id, title, status)| TodoDependencyItem {
            depends_on_todo: TodoDependsOnSummary { id, title, status },
        })
        .collect();

    Ok(Json(serde_json::json!({ "todo": todo })))
}

fn strip_html_plain(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace('\u{a0}', " ").trim().to_string()
}

async fn create_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<CreateTodoRequest>,
) -> Result<Response, AppError> {
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Title is required"));
    }

    // When creating a subtask, ensure the user can view the parent task.
    if let Some(ref parent_id) = body.parent_todo_id {
        let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;
        let parent_row: Option<(Option<String>, Option<String>)> =
            sqlx::query_as("SELECT assigned_to_id, ticket_id FROM todos WHERE id = $1")
                .bind(parent_id)
                .fetch_optional(&state.pool)
                .await?;
        let (owner, ticket_id) =
            parent_row.ok_or_else(|| AppError::not_found("Parent task not found"))?;
        let mut can_access = can_view_all || owner.as_deref() == Some(&user.id);
        if !can_access {
            if let Some(ref tid) = ticket_id {
                let t =
                    sqlx::query("SELECT created_by_id, assigned_to_id FROM tickets WHERE id = $1")
                        .bind(tid)
                        .fetch_optional(&state.pool)
                        .await?;
                if let Some(tr) = t {
                    let created: Option<String> = tr.get("created_by_id");
                    let assigned: Option<String> = tr.get("assigned_to_id");
                    can_access = created.as_deref() == Some(&user.id)
                        || assigned.as_deref() == Some(&user.id);
                }
            }
        }
        if !can_access {
            return Err(AppError::forbidden(
                "Not allowed to add subtasks to this task",
            ));
        }
    }

    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /todos".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("todo:create:{uid}");
    let b = body.clone();
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let user_id = uid.clone();
        let body = b.clone();
        move || {
            let user_id = user_id.clone();
            let body = body.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                let id = crate::id::new_cuid();
                let status = body.status.as_deref().unwrap_or("NOT_STARTED");
                let priority = body.priority.as_deref().unwrap_or("MEDIUM");
                let assigned_to = body.assigned_to_id.as_deref().unwrap_or(&user_id);

                let description_plain = body
                    .description_html
                    .as_deref()
                    .or(body.description.as_deref())
                    .map(strip_html_plain)
                    .filter(|s| !s.is_empty());

                let todo_number = next_todo_number(&mut tx).await.map_err(AppError::from)?;

                let start_ts = body
                    .start_date
                    .as_deref()
                    .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
                let due_ts = body
                    .due_date
                    .as_deref()
                    .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
                let desc_legacy = description_plain.as_deref().or(body.description.as_deref());

                sqlx::query(
                    r#"INSERT INTO todos (id, todo_number, title, description, description_html, description_plain,
                              status, priority, assigned_to_id, parent_todo_id,
                              ticket_id, estimated_hours, start_date, due_date, "order", created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::"TodoStatus", $8::"TodoPriority",
                   $9, $10, $11, $12, $13, $14, 0, NOW(), NOW())"#,
                )
                .bind(&id)
                .bind(&todo_number)
                .bind(body.title.trim())
                .bind(desc_legacy)
                .bind(&body.description_html)
                .bind(&description_plain)
                .bind(status)
                .bind(priority)
                .bind(assigned_to)
                .bind(&body.parent_todo_id)
                .bind(&body.ticket_id)
                .bind(body.estimated_hours)
                .bind(&start_ts)
                .bind(&due_ts)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::created(serde_json::json!({ "id": id })))
            }
        }
    }));
    let out = run_mutation_defer(broker, pool, shard, ctx, jobs, user.id.clone(), make_arc).await?;
    Ok(mutation_response(out))
}

async fn update_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateTodoRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PATCH /todos/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route,
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let b = body.clone();
    let shard = format!("todo:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let user_id = uid.clone();
        let body = b.clone();
        move || {
            let id = id.clone();
            let user_id = user_id.clone();
            let body = body.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                let existing =
                    sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1 FOR UPDATE")
                        .bind(&id)
                        .fetch_optional(&mut *tx)
                        .await?
                        .ok_or_else(|| AppError::not_found("Todo not found"))?;

                let owner: Option<String> = existing.get("assigned_to_id");
                if owner.as_deref() != Some(&user_id) {
                    return Err(AppError::forbidden("Not your todo"));
                }

                if let Some(ref title) = body.title {
                    sqlx::query("UPDATE todos SET title = $1, updated_at = NOW() WHERE id = $2")
                        .bind(title)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref desc) = body.description {
                    sqlx::query(
                        "UPDATE todos SET description = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(desc)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref desc_html) = body.description_html {
                    sqlx::query(
                        "UPDATE todos SET description_html = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(desc_html)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref aid) = body.assigned_to_id {
                    let s: Option<String> = aid
                        .as_str()
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty());
                    sqlx::query(
                        "UPDATE todos SET assigned_to_id = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(&s)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(est) = body.estimated_hours {
                    sqlx::query(
                        "UPDATE todos SET estimated_hours = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(est)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(act) = body.actual_hours {
                    sqlx::query(
                        "UPDATE todos SET actual_hours = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(act)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if body.start_date.is_some() {
                    let v = body
                        .start_date
                        .as_ref()
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
                    sqlx::query(
                        "UPDATE todos SET start_date = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(&v)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if body.due_date.is_some() {
                    let v = body
                        .due_date
                        .as_ref()
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
                    sqlx::query("UPDATE todos SET due_date = $1, updated_at = NOW() WHERE id = $2")
                        .bind(&v)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if body.ticket_id.is_some() {
                    let v = body
                        .ticket_id
                        .as_ref()
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty());
                    sqlx::query(
                        "UPDATE todos SET ticket_id = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(v)
                    .bind(&id)
                    .execute(&mut *tx)
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
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref priority) = body.priority {
                    sqlx::query(
                        r#"UPDATE todos SET priority = $1::"TodoPriority", updated_at = NOW() WHERE id = $2"#,
                    )
                    .bind(priority)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if body.archived_at.is_some() {
                    let set_null = body
                        .archived_at
                        .as_ref()
                        .map(serde_json::Value::is_null)
                        .unwrap_or(false);
                    if set_null {
                        sqlx::query(
                            "UPDATE todos SET archived_at = NULL, updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    } else {
                        sqlx::query(
                            "UPDATE todos SET archived_at = NOW(), updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                }
                if let Some(order) = body.order {
                    sqlx::query(
                        "UPDATE todos SET \"order\" = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(order)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }

                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({
                    "success": true,
                    "message": "Todo updated"
                })))
            }
        }
    }));
    let out = run_mutation_defer(broker, pool, shard, ctx, jobs, user.id.clone(), make_arc).await?;
    Ok(mutation_response(out))
}

async fn delete_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("DELETE /todos/{id}"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("todo:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let user_id = uid.clone();
        move || {
            let id = id.clone();
            let user_id = user_id.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                let existing =
                    sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1 FOR UPDATE")
                        .bind(&id)
                        .fetch_optional(&mut *tx)
                        .await?
                        .ok_or_else(|| AppError::not_found("Todo not found"))?;

                let owner: Option<String> = existing.get("assigned_to_id");
                if owner.as_deref() != Some(&user_id) {
                    return Err(AppError::forbidden("Not your todo"));
                }

                sqlx::query("DELETE FROM todos WHERE parent_todo_id = $1")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("DELETE FROM todos WHERE id = $1")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({
                    "success": true,
                    "message": "Todo deleted"
                })))
            }
        }
    }));
    let out = run_mutation_defer(broker, pool, shard, ctx, jobs, user.id.clone(), make_arc).await?;
    Ok(mutation_response(out))
}
