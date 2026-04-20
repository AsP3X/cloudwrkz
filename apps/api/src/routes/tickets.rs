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
use crate::models::ticket::{
    TicketActivityItem, TicketCommentCreateRequest, TicketCommentItem, TicketCreateRequest,
    TicketListItem, TicketListParams, TicketRow, TicketUpdateRequest,
};
use crate::routes::AppState;
use crate::routes::helpers::{
    check_permission, fetch_comment_author, fetch_group_summary, fetch_user_summary,
    get_user_permission_keys, hash_json_for_idempotency, idempotency_key_from_headers,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tickets", get(list_tickets).post(create_ticket))
        .route(
            "/tickets/{id}",
            get(get_ticket).patch(update_ticket).delete(delete_ticket),
        )
        .route(
            "/tickets/{id}/comments",
            get(list_ticket_comments).post(create_ticket_comment),
        )
        .route("/tickets/{id}/activities", get(list_ticket_activities))
}

async fn list_tickets(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TicketListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let permission_keys = get_user_permission_keys(&state.pool, &user.id).await;
    let can_view = permission_keys.iter().any(|k| k == "tickets.view")
        || permission_keys.iter().any(|k| k == "tickets.view_all")
        || permission_keys.iter().any(|k| k == "admin.tickets.manage");
    if !can_view {
        return Err(AppError::forbidden(
            "You don't have permission to view tickets",
        ));
    }

    let enabled: bool = sqlx::query_scalar("SELECT enabled FROM modules WHERE key = 'tickets'")
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or(false);
    if !enabled {
        return Ok(Json(serde_json::json!({ "tickets": [] })));
    }

    let can_view_all = permission_keys.iter().any(|k| k == "tickets.view_all")
        || permission_keys.iter().any(|k| k == "admin.tickets.manage");
    let status_filter = params.status.as_deref().unwrap_or("UNRESOLVED");
    let archive = params.archive.as_deref().unwrap_or("unarchived");
    let _ = (
        &params.sort,
        &params.created_by,
        &params.assigned_to_group,
        &params.created_from,
        &params.created_to,
        &params.updated_from,
        &params.updated_to,
    );

    let statuses: Vec<&str> = status_filter.split(',').map(|s| s.trim()).collect();
    let use_multi = statuses.len() > 1 && status_filter != "ALL" && status_filter != "UNRESOLVED";

    let rows = if use_multi {
        let mut sql = String::from(
            r#"SELECT id, ticket_number, title, description, description_plain,
                      type::text, status::text, priority::text,
                      created_by_id, assigned_to_id, assigned_to_group_id,
                      archived_at, created_at, updated_at
               FROM tickets
               WHERE status::text IN ("#,
        );
        for (i, _) in statuses.iter().enumerate() {
            if i > 0 {
                sql.push_str(", ");
            }
            sql.push_str(&format!("${}", i + 1));
        }
        let next = statuses.len() + 1;
        sql.push_str(&format!(
            r#")
                 AND (${}::bool OR created_by_id = ${} OR assigned_to_id = ${})
                 AND (${} = 'archived' AND archived_at IS NOT NULL
                      OR ${} != 'archived' AND archived_at IS NULL)
                 ORDER BY created_at DESC"#,
            next,
            next + 1,
            next + 1,
            next + 2,
            next + 2
        ));
        let mut query = sqlx::query(&sql);
        for s in &statuses {
            query = query.bind(*s);
        }
        query
            .bind(can_view_all)
            .bind(&user.id)
            .bind(archive)
            .fetch_all(&state.pool)
            .await?
    } else {
        sqlx::query(
            r#"SELECT id, ticket_number, title, description, description_plain,
                      type::text, status::text, priority::text,
                      created_by_id, assigned_to_id, assigned_to_group_id,
                      archived_at, created_at, updated_at
               FROM tickets
               WHERE ($1::text = 'ALL'
                      OR ($1 = 'UNRESOLVED' AND status IN ('OPEN', 'IN_PROGRESS', 'PENDING'))
                      OR status::text = $1)
                 AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3)
                 AND (($4 = 'archived' AND archived_at IS NOT NULL)
                      OR ($4 != 'archived' AND archived_at IS NULL))
               ORDER BY created_at DESC"#,
        )
        .bind(status_filter)
        .bind(can_view_all)
        .bind(&user.id)
        .bind(archive)
        .fetch_all(&state.pool)
        .await?
    };

    let mut items = Vec::with_capacity(rows.len());
    for r in &rows {
        let id: String = r.get("id");
        let created_by_id: Option<String> = r.get("created_by_id");
        let assigned_to_id: Option<String> = r.get("assigned_to_id");
        let assigned_to_group_id: Option<String> = r.get("assigned_to_group_id");

        let created_by = match created_by_id {
            Some(ref uid) => fetch_user_summary(&state.pool, uid).await,
            None => None,
        };
        let assigned_to = match assigned_to_id {
            Some(ref uid) => fetch_user_summary(&state.pool, uid).await,
            None => None,
        };
        let assigned_to_group = match assigned_to_group_id {
            Some(ref gid) => fetch_group_summary(&state.pool, gid).await,
            None => None,
        };
        let comment_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = $1")
                .bind(&id)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0);

        items.push(TicketListItem {
            id,
            ticket_number: r.get("ticket_number"),
            title: r.get("title"),
            description: r.get("description"),
            description_plain: r.get("description_plain"),
            r#type: r.get("type"),
            status: r.get("status"),
            priority: r.get("priority"),
            archived_at: r.get("archived_at"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
            created_by,
            assigned_to,
            assigned_to_group,
            comment_count,
        });
    }

    Ok(Json(serde_json::json!({ "tickets": items })))
}

async fn get_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;

    let r: Option<TicketRow> = sqlx::query_as(
        r#"SELECT id, ticket_number, title, description, description_plain,
                  type::text as type, status::text as status, priority::text as priority,
                  tags, attachments, created_by_id, assigned_to_id, assigned_to_group_id,
                  archived_at, due_date, resolved_at, closed_at, created_at, updated_at
           FROM tickets
           WHERE id = $1
             AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3)"#,
    )
    .bind(&id)
    .bind(can_view_all)
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;
    let r = r.ok_or_else(|| AppError::not_found("Ticket not found"))?;

    let comment_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = $1")
            .bind(&id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    let created_by = match &r.created_by_id {
        Some(uid) => fetch_user_summary(&state.pool, uid).await,
        None => None,
    };
    let assigned_to = match &r.assigned_to_id {
        Some(uid) => fetch_user_summary(&state.pool, uid).await,
        None => None,
    };
    let assigned_to_group = match &r.assigned_to_group_id {
        Some(gid) => fetch_group_summary(&state.pool, gid).await,
        None => None,
    };

    let ticket = TicketListItem {
        id: r.id,
        ticket_number: r.ticket_number,
        title: r.title,
        description: r.description,
        description_plain: r.description_plain,
        r#type: r.r#type,
        status: r.status,
        priority: r.priority,
        archived_at: r.archived_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        created_by,
        assigned_to,
        assigned_to_group,
        comment_count,
    };

    Ok(Json(serde_json::json!({ "ticket": ticket })))
}

async fn create_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<TicketCreateRequest>,
) -> Result<Response, AppError> {
    let permission_keys = get_user_permission_keys(&state.pool, &user.id).await;
    let can_create = permission_keys
        .iter()
        .any(|k| k == "tickets.create" || k == "admin.tickets.manage")
        || permission_keys.is_empty(); // Allow when user has no permissions (e.g. create ticket to request access)
    if !can_create {
        return Err(AppError::forbidden(
            "You don't have permission to create tickets",
        ));
    }
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Title is required"));
    }

    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /tickets".into(),
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
        .map_err(|e| AppError::internal(format!("serialize ticket create: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TICKET_CREATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Ticket creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TICKET_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn update_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<TicketUpdateRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PATCH /tickets/{id}");
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
        .map_err(|e| AppError::internal(format!("serialize ticket update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "ticket_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TICKET_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Ticket update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TICKET_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let body_hash = 0u64;
    let route = format!("DELETE /tickets/{id}");
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

    let job_payload = json!({
        "user_id": user.id,
        "ticket_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TICKET_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Ticket deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TICKET_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn list_ticket_comments(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;

    let ticket = sqlx::query(
        "SELECT id, created_by_id, assigned_to_id FROM tickets WHERE id = $1
         AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3)",
    )
    .bind(&id)
    .bind(can_view_all)
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;

    let _ticket = ticket.ok_or_else(|| AppError::not_found("Ticket not found"))?;

    let can_see_internal =
        check_permission(&state.pool, &user.id, "tickets.comments.view_internal").await;

    let rows = if can_see_internal {
        sqlx::query(
            r#"SELECT id, content, content_html, content_plain, merged_from_ticket_number,
                      created_at, updated_at, is_agent_only, user_id, author_name
               FROM ticket_comments WHERE ticket_id = $1 ORDER BY created_at DESC"#,
        )
        .bind(&id)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query(
            r#"SELECT id, content, content_html, content_plain, merged_from_ticket_number,
                      created_at, updated_at, is_agent_only, user_id, author_name
               FROM ticket_comments WHERE ticket_id = $1 AND is_agent_only = false
               ORDER BY created_at DESC"#,
        )
        .bind(&id)
        .fetch_all(&state.pool)
        .await?
    };

    let mut comments = Vec::with_capacity(rows.len());
    for r in &rows {
        let comment_id: String = r.get("id");
        let user_id: Option<String> = r.get("user_id");
        let author = match &user_id {
            Some(uid) => fetch_comment_author(&state.pool, uid).await,
            None => None,
        };
        comments.push(TicketCommentItem {
            id: comment_id,
            content: r.get("content"),
            content_html: r.get("content_html"),
            content_plain: r.get("content_plain"),
            merged_from_ticket_number: r.get("merged_from_ticket_number"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
            is_agent_only: r.get("is_agent_only"),
            user_id,
            author_name: r.get("author_name"),
            user: author,
        });
    }

    Ok(Json(serde_json::json!({ "comments": comments })))
}

async fn create_ticket_comment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<TicketCommentCreateRequest>,
) -> Result<Response, AppError> {
    let content_trimmed = body.content.trim().to_string();
    if content_trimmed.is_empty() {
        return Err(AppError::bad_request("Comment cannot be empty"));
    }

    if body.is_agent_only {
        let ok = check_permission(&state.pool, &user.id, "tickets.comments.agent_only").await;
        if !ok {
            return Err(AppError::forbidden(
                "You don't have permission to create internal comments",
            ));
        }
    }

    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("POST /tickets/{id}/comments");
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
        .map_err(|e| AppError::internal(format!("serialize ticket comment: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "ticket_id": id,
        "user_name": user.name,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TICKET_COMMENT_CREATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Comment is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TICKET_COMMENT_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn list_ticket_activities(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;

    let ticket = sqlx::query(
        "SELECT id FROM tickets WHERE id = $1
         AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3)",
    )
    .bind(&id)
    .bind(can_view_all)
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;

    let _ticket = ticket.ok_or_else(|| AppError::not_found("Ticket not found"))?;

    let rows = sqlx::query(
        r#"SELECT id, activity_type::text, merged_from_ticket_number, changed_by_id, changed_by_name,
                  old_value, new_value, metadata, created_at
           FROM ticket_activities WHERE ticket_id = $1 ORDER BY created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;

    let mut activities = Vec::with_capacity(rows.len());
    for r in &rows {
        let changed_by_id: Option<String> = r.get("changed_by_id");
        let changed_by = match &changed_by_id {
            Some(uid) => fetch_user_summary(&state.pool, uid).await,
            None => None,
        };
        activities.push(TicketActivityItem {
            id: r.get("id"),
            activity_type: r.get("activity_type"),
            merged_from_ticket_number: r.get("merged_from_ticket_number"),
            changed_by_id,
            changed_by_name: r.get("changed_by_name"),
            old_value: r.get("old_value"),
            new_value: r.get("new_value"),
            metadata: r.get("metadata"),
            created_at: r.get("created_at"),
            changed_by,
        });
    }

    Ok(Json(serde_json::json!({ "activities": activities })))
}
