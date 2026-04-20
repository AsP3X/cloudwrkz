use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::command_queue::{MutationQueuedResponse, MutationRunContext};
use crate::error::AppError;
use crate::job_queue::entity_creates;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TodoListParentScope {
    RootOnly,
    SubtasksOnly,
    All,
}

/// Web-vite passes `kind` on `/todos`; iOS uses `includeSubtodos`. When `kind` is absent or
/// unrecognized, fall back to `includeSubtodos` (default: root-only, same as Next handler).
fn todo_list_parent_scope(params: &TodoListParams) -> TodoListParentScope {
    let from_include = || {
        if params.include_subtodos == Some(true) {
            TodoListParentScope::All
        } else {
            TodoListParentScope::RootOnly
        }
    };
    match params
        .kind
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(k) if k.eq_ignore_ascii_case("root") => TodoListParentScope::RootOnly,
        Some(k) if k.eq_ignore_ascii_case("subtask") || k.eq_ignore_ascii_case("subtodo") => {
            TodoListParentScope::SubtasksOnly
        }
        Some(k) if k.eq_ignore_ascii_case("all") => TodoListParentScope::All,
        Some(_) => from_include(),
        None => from_include(),
    }
}

async fn list_todos(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TodoListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let archive = params.archive.as_deref().unwrap_or("unarchived");
    // Align with `get-todos-handler.ts`: `ALL` means no filter (iOS always sends status=ALL & priority=ALL).
    let priority_filter: Option<String> = match params.priority.as_deref() {
        None | Some("") | Some("ALL") => None,
        Some(p) => Some(p.to_string()),
    };
    let parent_scope = todo_list_parent_scope(&params);
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
        .map(|s| {
            s.split(',')
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty() && v != "ALL")
                .collect()
        })
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
    match parent_scope {
        TodoListParentScope::RootOnly => sql.push_str(" AND parent_todo_id IS NULL"),
        TodoListParentScope::SubtasksOnly => sql.push_str(" AND parent_todo_id IS NOT NULL"),
        TodoListParentScope::All => {}
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
        .bind(&priority_filter)
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
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize todo create: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TODO_CREATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Todo creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TODO_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize todo update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "todo_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TODO_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Todo update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TODO_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_todo(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("DELETE /todos/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route,
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let job_payload = json!({
        "user_id": user.id,
        "todo_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TODO_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Todo deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TODO_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}
