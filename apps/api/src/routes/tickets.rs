use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::ticket::*;
use crate::routes::helpers::{check_permission, fetch_group_summary, fetch_user_summary};
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tickets", get(list_tickets))
        .route(
            "/tickets/{id}",
            axum::routing::patch(update_ticket).delete(delete_ticket),
        )
}

async fn list_tickets(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TicketListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let enabled: bool = sqlx::query_scalar("SELECT enabled FROM modules WHERE key = 'tickets'")
        .fetch_optional(&state.pool)
        .await?
        .unwrap_or(false);
    if !enabled {
        return Ok(Json(serde_json::json!({ "tickets": [] })));
    }

    let can_view_all = check_permission(&state.pool, &user.id, "tickets.view_all").await;
    let status_filter = params.status.as_deref().unwrap_or("UNRESOLVED");
    let archive = params.archive.as_deref().unwrap_or("unarchived");

    let rows = sqlx::query(
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
    .await?;

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
