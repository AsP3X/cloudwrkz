use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::{PgPool, Row};

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::ticket::{
    TicketCreateRequest, TicketListItem, TicketListParams, TicketRow, TicketUpdateRequest,
};
use crate::routes::helpers::{check_permission, fetch_group_summary, fetch_user_summary, get_user_permission_keys};
use crate::routes::AppState;

/// Map ticket type to prefix for ticket number. All tickets use the 3-letter prefix TSK.
fn ticket_type_prefix(_t: &str) -> &'static str {
    "TSK"
}

/// Generate next sequential ticket number for the given type: PREFIX-000001.
async fn next_ticket_number(pool: &PgPool, ticket_type: &str) -> Result<String, AppError> {
    let prefix = ticket_type_prefix(ticket_type);
    let pattern = format!("{}-%", prefix);

    let row = sqlx::query_scalar::<_, String>(
        r#"SELECT ticket_number FROM tickets
           WHERE ticket_number LIKE $1
           ORDER BY ticket_number DESC
           LIMIT 1"#,
    )
    .bind(&pattern)
    .fetch_optional(pool)
    .await?;

    let next_seq = match &row {
        Some(num) => {
            let seq_str = num.rsplit('-').next().unwrap_or("0");
            seq_str.parse::<u32>().unwrap_or(0).saturating_add(1)
        }
        None => 1,
    };

    Ok(format!("{}-{:06}", prefix, next_seq))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tickets", get(list_tickets).post(create_ticket))
        .route(
            "/tickets/{id}",
            get(get_ticket).patch(update_ticket).delete(delete_ticket),
        )
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
    let use_multi = statuses.len() > 1
        && status_filter != "ALL"
        && status_filter != "UNRESOLVED";

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
            if i > 0 { sql.push_str(", "); }
            sql.push_str(&format!("${}", i + 1));
        }
        let next = statuses.len() + 1;
        sql.push_str(&format!(
            r#")
                 AND (${}::bool OR created_by_id = ${} OR assigned_to_id = ${})
                 AND (${} = 'archived' AND archived_at IS NOT NULL
                      OR ${} != 'archived' AND archived_at IS NULL)
                 ORDER BY created_at DESC"#,
            next, next + 1, next + 1, next + 2, next + 2
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
    Json(body): Json<TicketCreateRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let permission_keys = get_user_permission_keys(&state.pool, &user.id).await;
    let can_create = permission_keys.iter().any(|k| k == "tickets.create" || k == "admin.tickets.manage")
        || permission_keys.is_empty(); // Allow when user has no permissions (e.g. create ticket to request access)
    if !can_create {
        return Err(AppError::forbidden(
            "You don't have permission to create tickets",
        ));
    }
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("Title is required"));
    }

    let id = crate::id::new_cuid();
    let ticket_type = body.r#type.as_deref().unwrap_or("QUESTION");
    let ticket_number = next_ticket_number(&state.pool, ticket_type).await?;
    let priority = body.priority.as_deref().unwrap_or("MEDIUM");

    let tags = body.tags.as_deref().unwrap_or(&[]);
    sqlx::query(
        r#"INSERT INTO tickets (id, ticket_number, title, description, description_plain,
                                type, status, priority, tags, created_by_id, assigned_to_id,
                                assigned_to_group_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::"TicketType", 'OPEN'::"TicketStatus",
                   $7::"TicketPriority", $8, $9, $10, $11, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&ticket_number)
    .bind(body.title.trim())
    .bind(&body.description)
    .bind(&body.description_plain)
    .bind(ticket_type)
    .bind(priority)
    .bind(tags)
    .bind(&user.id)
    .bind(&body.assigned_to_id)
    .bind(&body.assigned_to_group_id)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": id, "ticket_number": ticket_number })),
    ))
}

async fn update_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<TicketUpdateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let ticket = sqlx::query("SELECT id, created_by_id FROM tickets WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Ticket not found"))?;

    let created_by_id: Option<String> = ticket.get("created_by_id");
    let can_edit_all = check_permission(&state.pool, &user.id, "tickets.edit_all").await;
    if !can_edit_all && created_by_id.as_deref() != Some(&user.id) {
        return Err(AppError::forbidden(
            "You don't have permission to update this ticket",
        ));
    }

    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            sqlx::query("UPDATE tickets SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                .bind(&id)
                .execute(&state.pool)
                .await?;
        }
    }
    if let Some(ref title) = body.title {
        sqlx::query("UPDATE tickets SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref status) = body.status {
        sqlx::query(
            "UPDATE tickets SET status = $1::\"TicketStatus\", updated_at = NOW() WHERE id = $2",
        )
        .bind(status)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    }
    if let Some(ref priority) = body.priority {
        sqlx::query(
            "UPDATE tickets SET priority = $1::\"TicketPriority\", updated_at = NOW() WHERE id = $2",
        )
        .bind(priority)
        .bind(&id)
        .execute(&state.pool)
        .await?;
    }
    if let Some(ref desc) = body.description {
        sqlx::query("UPDATE tickets SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(desc)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref t) = body.r#type {
        sqlx::query("UPDATE tickets SET type = $1::\"TicketType\", updated_at = NOW() WHERE id = $2")
            .bind(t)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.assigned_to_id {
        let opt: Option<String> = if v.is_empty() { None } else { Some(v.clone()) };
        sqlx::query("UPDATE tickets SET assigned_to_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(&opt)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref v) = body.assigned_to_group_id {
        let opt: Option<String> = if v.is_empty() { None } else { Some(v.clone()) };
        sqlx::query("UPDATE tickets SET assigned_to_group_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(&opt)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref tags) = body.tags {
        sqlx::query("UPDATE tickets SET tags = $1, updated_at = NOW() WHERE id = $2")
            .bind(tags)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref due) = body.due_date {
        sqlx::query("UPDATE tickets SET due_date = $1::timestamp, updated_at = NOW() WHERE id = $2")
            .bind(due)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Ticket updated" }),
    ))
}

async fn delete_ticket(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let ticket = sqlx::query("SELECT id, created_by_id FROM tickets WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Ticket not found"))?;

    let created_by_id: Option<String> = ticket.get("created_by_id");
    let can_delete_all = check_permission(&state.pool, &user.id, "tickets.delete_all").await;
    if !can_delete_all && created_by_id.as_deref() != Some(&user.id) {
        return Err(AppError::forbidden(
            "You don't have permission to delete this ticket",
        ));
    }

    sqlx::query("DELETE FROM tickets WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "message": "Ticket deleted" })),
    ))
}
