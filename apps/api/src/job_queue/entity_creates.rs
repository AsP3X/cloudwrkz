//! Persisted `background_jobs` workers for ticket / todo / time entry / link mutations (creates and ticket updates/deletes/comments).
//! HTTP handlers enqueue and return HTTP 202; clients poll `GET /mutation-jobs/{id}` (see `routes/mutation_jobs.rs`).

use axum::http::StatusCode;
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::{error, info, warn};

use crate::command_queue::{
    JsonMutationResult, MutationBroker, MutationJobStatusKind, MutationJobStatusResponse,
    apply_mutation_tx_settings,
};
use crate::db::is_transient_sqlx;
use crate::db::numbering::{next_ticket_number, next_todo_number};
use crate::error::AppError;
use crate::github_metadata;
use crate::id::new_cuid;
use crate::link_preview::{extract_metadata_from_url, normalize_url};
use crate::models::link::CreateLinkRequest;
use crate::models::ticket::{
    TicketCommentCreateRequest, TicketCreateRequest, TicketUpdateRequest,
};
use crate::routes::helpers::check_permission_mut_tx;
use crate::models::time_entry::{AddTimeEntryRequest, CreateTimeEntryRequest};
use crate::models::todo::CreateTodoRequest;

use super::enqueue_github_link_metadata_job;

pub const JOB_TYPE_TICKET_CREATE: &str = "ticket_create";
pub const JOB_TYPE_TICKET_UPDATE: &str = "ticket_update";
pub const JOB_TYPE_TICKET_DELETE: &str = "ticket_delete";
pub const JOB_TYPE_TICKET_COMMENT_CREATE: &str = "ticket_comment_create";
pub const JOB_TYPE_TODO_CREATE: &str = "todo_create";
pub const JOB_TYPE_TIME_ENTRY_CREATE_TIMER: &str = "time_entry_create_timer";
pub const JOB_TYPE_TIME_ENTRY_CREATE_MANUAL: &str = "time_entry_create_manual";
pub const JOB_TYPE_LINK_CREATE: &str = "link_create";

pub const ENTITY_CREATE_POLL_DEADLINE_SECS: u32 = 120;

pub fn is_entity_create_job_type(job_type: &str) -> bool {
    matches!(
        job_type,
        JOB_TYPE_TICKET_CREATE
            | JOB_TYPE_TICKET_UPDATE
            | JOB_TYPE_TICKET_DELETE
            | JOB_TYPE_TICKET_COMMENT_CREATE
            | JOB_TYPE_TODO_CREATE
            | JOB_TYPE_TIME_ENTRY_CREATE_TIMER
            | JOB_TYPE_TIME_ENTRY_CREATE_MANUAL
            | JOB_TYPE_LINK_CREATE
    )
}

/// Enqueue a persisted create job; returns new job id.
pub async fn enqueue_entity_create_job(
    pool: &PgPool,
    job_type: &str,
    user_id: &str,
    payload: serde_json::Value,
) -> Result<String, sqlx::Error> {
    let id = new_cuid();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', NULL, $4, NOW(), NOW(), NULL)"#,
    )
    .bind(&id)
    .bind(job_type)
    .bind(sqlx::types::Json(payload))
    .bind(user_id)
    .execute(pool)
    .await?;
    info!(
        event = "jobs.entity_create.enqueued",
        job_id = %id,
        job_type = %job_type,
        user_id = %user_id,
        "entity create background job inserted (pending)"
    );
    Ok(id)
}

pub async fn try_entity_create_job_status_for_user(
    pool: &PgPool,
    job_id: &str,
    user_id: &str,
) -> Result<Option<MutationJobStatusResponse>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT job_type, status, error_message, payload, created_by_user_id
           FROM background_jobs WHERE id = $1"#,
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let job_type: String = row.get("job_type");
    if !is_entity_create_job_type(&job_type) {
        return Ok(None);
    }

    let owner: Option<String> = row.get("created_by_user_id");
    if owner.as_deref() != Some(user_id) {
        return Ok(None);
    }

    let status: String = row.get("status");
    let out = match status.as_str() {
        "pending" | "processing" => MutationJobStatusResponse {
            status: MutationJobStatusKind::Pending,
            message: Some(
                "Request is still processing in the background job queue.".into(),
            ),
            http_status: None,
            body: None,
        },
        "completed" => {
            let payload: serde_json::Value = row.get("payload");
            let result = payload.get("result");
            let http_status = result
                .and_then(|r| r.get("http_status"))
                .and_then(|v| v.as_u64())
                .map(|u| u as u16)
                .unwrap_or(200);
            let body = result.and_then(|r| r.get("body")).cloned();
            MutationJobStatusResponse {
                status: MutationJobStatusKind::Completed,
                message: None,
                http_status: Some(http_status),
                body,
            }
        }
        "failed" => MutationJobStatusResponse {
            status: MutationJobStatusKind::Failed,
            message: row
                .try_get::<Option<String>, _>("error_message")
                .ok()
                .flatten(),
            http_status: None,
            body: None,
        },
        _ => MutationJobStatusResponse {
            status: MutationJobStatusKind::Failed,
            message: Some("Unexpected job state.".into()),
            http_status: None,
            body: None,
        },
    };

    Ok(Some(out))
}

enum JobExecOutcome {
    Ok(JsonMutationResult),
    Fail(AppError),
    TransientDb,
}

async fn mark_job_failed(pool: &PgPool, job_id: &str, msg: &str) {
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

async fn defer_job_transient(pool: &PgPool, job_id: &str) {
    let _ = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'pending',
               started_at = NULL,
               run_after = clock_timestamp() + interval '400 milliseconds',
               updated_at = clock_timestamp()
           WHERE id = $1 AND status = 'processing'"#,
    )
    .bind(job_id)
    .execute(pool)
    .await;
}

async fn complete_job(
    pool: &PgPool,
    job_id: &str,
    jr: &JsonMutationResult,
) -> Result<(), sqlx::Error> {
    let result = json!({
        "http_status": jr.status.as_u16(),
        "body": jr.body,
    });
    sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'completed',
               error_message = NULL,
               payload = jsonb_set(payload, '{result}', $2::jsonb, true),
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(sqlx::types::Json(result))
    .execute(pool)
    .await?;
    Ok(())
}

async fn apply_idempotency_from_payload(
    broker: &MutationBroker,
    payload: &serde_json::Value,
    jr: &JsonMutationResult,
) {
    let route = payload.get("route").and_then(|v| v.as_str());
    let body_hash = payload.get("body_hash").and_then(|v| v.as_u64());
    let idempotency_key = payload
        .get("idempotency_key")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let user_id = payload.get("user_id").and_then(|v| v.as_str());

    if let (Some(user_id), Some(ik), Some(route), Some(body_hash)) =
        (user_id, idempotency_key, route, body_hash)
    {
        if jr.status.is_success() {
            broker
                .idempotency
                .put(user_id, ik, route, body_hash, jr.clone())
                .await;
        }
    }
}

pub async fn run_entity_create_job(
    pool: &PgPool,
    http: &Client,
    broker: &MutationBroker,
    job_id: &str,
    job_type: &str,
    payload: &serde_json::Value,
) {
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;

    let outcome = match job_type {
        JOB_TYPE_TICKET_CREATE => exec_ticket_create(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TICKET_UPDATE => exec_ticket_update(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TICKET_DELETE => exec_ticket_delete(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TICKET_COMMENT_CREATE => {
            exec_ticket_comment_create(pool, lock_ms, stmt_ms, payload).await
        },
        JOB_TYPE_TODO_CREATE => exec_todo_create(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TIME_ENTRY_CREATE_TIMER => {
            exec_time_entry_timer_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_TIME_ENTRY_CREATE_MANUAL => {
            exec_time_entry_manual_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_LINK_CREATE => exec_link_create(pool, http, lock_ms, stmt_ms, payload).await,
        _ => JobExecOutcome::Fail(AppError::internal("Unknown entity create job type")),
    };

    match outcome {
        JobExecOutcome::Ok(jr) => {
            if let Err(e) = complete_job(pool, job_id, &jr).await {
                error!(
                    event = "entity_create_job.complete_failed",
                    job_id = %job_id,
                    error = %e,
                    "failed to mark entity create job completed"
                );
                mark_job_failed(
                    pool,
                    job_id,
                    "Could not finalize job status; please contact support.",
                )
                .await;
                return;
            }
            info!(
                event = "jobs.entity_create.completed",
                job_id = %job_id,
                job_type = %job_type,
                http_status = jr.status.as_u16(),
                "entity create background job completed"
            );
            apply_idempotency_from_payload(broker, payload, &jr).await;
        }
        JobExecOutcome::Fail(e) => {
            warn!(
                event = "entity_create_job.failed",
                job_id = %job_id,
                message = %e.message,
                "entity create job failed"
            );
            mark_job_failed(pool, job_id, &e.message).await;
        }
        JobExecOutcome::TransientDb => {
            defer_job_transient(pool, job_id).await;
        }
    }
}

fn map_sqlx_ticket(err: sqlx::Error) -> JobExecOutcome {
    if is_transient_sqlx(&err) {
        JobExecOutcome::TransientDb
    } else {
        JobExecOutcome::Fail(AppError::from(err))
    }
}

async fn exec_ticket_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: TicketCreateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid ticket body: {e}"))),
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let ticket_number = match next_ticket_number(&mut tx).await {
        Ok(n) => n,
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };
    let id = new_cuid();
    let ticket_type = body.r#type.as_deref().unwrap_or("QUESTION");
    let priority = body.priority.as_deref().unwrap_or("MEDIUM");
    let tags = body.tags.as_deref().unwrap_or(&[]);

    let res = sqlx::query(
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
    .bind(&user_id)
    .bind(&body.assigned_to_id)
    .bind(&body.assigned_to_group_id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({
        "id": id,
        "ticket_number": ticket_number
    })))
}

async fn exec_ticket_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"))
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: TicketUpdateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid ticket update: {e}")))
        }
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let ticket = match sqlx::query("SELECT id, created_by_id FROM tickets WHERE id = $1 FOR UPDATE")
        .bind(&ticket_id)
        .fetch_optional(&mut *tx)
        .await
    {
        Ok(Some(t)) => t,
        Ok(None) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(AppError::not_found("Ticket not found"));
        }
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };

    let created_by_id: Option<String> = ticket.get("created_by_id");
    let can_edit_all = check_permission_mut_tx(&mut tx, &user_id, "tickets.edit_all").await;
    if !can_edit_all && created_by_id.as_deref() != Some(&user_id) {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to update this ticket",
        ));
    }

    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            if let Err(e) = sqlx::query(
                "UPDATE tickets SET archived_at = NULL, updated_at = NOW() WHERE id = $1",
            )
            .bind(&ticket_id)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        }
    }
    if let Some(ref title) = body.title {
        if let Err(e) =
            sqlx::query("UPDATE tickets SET title = $1, updated_at = NOW() WHERE id = $2")
                .bind(title)
                .bind(&ticket_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref status) = body.status {
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET status = $1::\"TicketStatus\", updated_at = NOW() WHERE id = $2",
        )
        .bind(status)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref priority) = body.priority {
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET priority = $1::\"TicketPriority\", updated_at = NOW() WHERE id = $2",
        )
        .bind(priority)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref desc) = body.description {
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET description = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(desc)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref t) = body.r#type {
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET type = $1::\"TicketType\", updated_at = NOW() WHERE id = $2",
        )
        .bind(t)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref v) = body.assigned_to_id {
        let opt: Option<String> = if v.is_empty() { None } else { Some(v.clone()) };
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET assigned_to_id = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&opt)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref v) = body.assigned_to_group_id {
        let opt: Option<String> = if v.is_empty() { None } else { Some(v.clone()) };
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET assigned_to_group_id = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&opt)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref tags) = body.tags {
        if let Err(e) =
            sqlx::query("UPDATE tickets SET tags = $1, updated_at = NOW() WHERE id = $2")
                .bind(tags)
                .bind(&ticket_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref due) = body.due_date {
        if let Err(e) = sqlx::query(
            "UPDATE tickets SET due_date = $1::timestamp, updated_at = NOW() WHERE id = $2",
        )
        .bind(due)
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({
        "success": true,
        "message": "Ticket updated"
    })))
}

async fn exec_ticket_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"))
        }
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let ticket = match sqlx::query("SELECT id, created_by_id FROM tickets WHERE id = $1 FOR UPDATE")
        .bind(&ticket_id)
        .fetch_optional(&mut *tx)
        .await
    {
        Ok(Some(t)) => t,
        Ok(None) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(AppError::not_found("Ticket not found"));
        }
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };

    let created_by_id: Option<String> = ticket.get("created_by_id");
    let can_delete_all = check_permission_mut_tx(&mut tx, &user_id, "tickets.delete_all").await;
    if !can_delete_all && created_by_id.as_deref() != Some(&user_id) {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to delete this ticket",
        ));
    }

    if let Err(e) = sqlx::query("DELETE FROM tickets WHERE id = $1")
        .bind(&ticket_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({
        "success": true,
        "message": "Ticket deleted"
    })))
}

async fn exec_ticket_comment_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"))
        }
    };
    let user_name: Option<String> = payload.get("user_name").and_then(|v| {
        serde_json::from_value::<Option<String>>(v.clone())
            .ok()
            .flatten()
    });
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: TicketCommentCreateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid comment body: {e}")))
        }
    };

    let content_trimmed = body.content.trim().to_string();
    if content_trimmed.is_empty() {
        return JobExecOutcome::Fail(AppError::bad_request("Comment cannot be empty"));
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let can_view_all = check_permission_mut_tx(&mut tx, &user_id, "tickets.view_all").await;
    let ticket = match sqlx::query(
        "SELECT id, created_by_id, assigned_to_id FROM tickets WHERE id = $1
         AND ($2::bool OR created_by_id = $3 OR assigned_to_id = $3) FOR UPDATE",
    )
    .bind(&ticket_id)
    .bind(can_view_all)
    .bind(&user_id)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(t) => t,
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };

    if ticket.is_none() {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::not_found("Ticket not found"));
    }

    let can_comment = check_permission_mut_tx(&mut tx, &user_id, "tickets.comment").await
        || check_permission_mut_tx(&mut tx, &user_id, "tickets.view").await
        || check_permission_mut_tx(&mut tx, &user_id, "tickets.view_all").await
        || check_permission_mut_tx(&mut tx, &user_id, "admin.tickets.manage").await;
    if !can_comment {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to comment on this ticket",
        ));
    }

    let mut content_plain = strip_html_plain(&content_trimmed);
    if content_plain.is_empty() {
        content_plain = content_trimmed.clone();
    }

    let comment_id = new_cuid();
    let now = chrono::Utc::now().naive_utc();

    if let Err(e) = sqlx::query(
        r#"INSERT INTO ticket_comments (id, ticket_id, user_id, content, content_html, content_plain, is_agent_only, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)"#,
    )
    .bind(&comment_id)
    .bind(&ticket_id)
    .bind(&user_id)
    .bind(&content_plain)
    .bind(&content_trimmed)
    .bind(&content_plain)
    .bind(body.is_agent_only)
    .bind(now)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let activity_id = new_cuid();
    if let Err(e) = sqlx::query(
        r#"INSERT INTO ticket_activities (id, ticket_id, activity_type, changed_by_id, changed_by_name, metadata, created_at)
           VALUES ($1, $2, 'COMMENT_ADDED'::"TicketActivityType", $3, $4, $5, $6)"#,
    )
    .bind(&activity_id)
    .bind(&ticket_id)
    .bind(&user_id)
    .bind(&user_name)
    .bind(json!({ "commentId": comment_id, "isAgentOnly": body.is_agent_only }))
    .bind(now)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({
        "id": comment_id,
        "success": true,
        "message": "Comment added successfully"
    })))
}

async fn exec_todo_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: CreateTodoRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid todo body: {e}"))),
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let id = new_cuid();
    let status = body.status.as_deref().unwrap_or("NOT_STARTED");
    let priority = body.priority.as_deref().unwrap_or("MEDIUM");
    let assigned_to = body.assigned_to_id.as_deref().unwrap_or(&user_id);

    let description_plain = body
        .description_html
        .as_deref()
        .or(body.description.as_deref())
        .map(strip_html_plain)
        .filter(|s| !s.is_empty());

    let todo_number = match next_todo_number(&mut tx).await {
        Ok(n) => n,
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };

    let start_ts = body
        .start_date
        .as_deref()
        .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
    let due_ts = body
        .due_date
        .as_deref()
        .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
    let desc_legacy = description_plain.as_deref().or(body.description.as_deref());

    let res = sqlx::query(
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
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": id })))
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

async fn exec_time_entry_timer_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: CreateTimeEntryRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid time entry body: {e}")))
        }
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let id = new_cuid();
    let name = body.name.unwrap_or_else(|| "Timer".to_string());
    let tags = body.tags.unwrap_or_default();
    let now = chrono::Utc::now().naive_utc();

    let res = sqlx::query(
        r#"INSERT INTO time_entries (id, name, description, status, started_at, last_resumed_at,
                             total_duration, user_id, ticket_id, tags, billable, location,
                             created_at, updated_at)
           VALUES ($1, $2, $3, 'RUNNING', $4, $4, 0, $5, $6, $7, $8, $9, $4, $4)"#,
    )
    .bind(&id)
    .bind(&name)
    .bind(&body.description)
    .bind(now)
    .bind(&user_id)
    .bind(&body.ticket_id)
    .bind(&tags)
    .bind(body.billable.unwrap_or(false))
    .bind(&body.location)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": id })))
}

async fn exec_time_entry_manual_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: AddTimeEntryRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid manual time entry body: {e}")))
        }
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let id = new_cuid();
    let total_secs = body.hours.unwrap_or(0) * 3600
        + body.minutes.unwrap_or(0) * 60
        + body.seconds.unwrap_or(0);

    let started_at = body
        .started_at
        .as_deref()
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
        .unwrap_or_else(|| chrono::Utc::now().naive_utc());
    let stopped_at = started_at + chrono::Duration::seconds(total_secs as i64);
    let tags = body.tags.unwrap_or_default();

    let res = sqlx::query(
        r#"INSERT INTO time_entries (id, name, description, status, started_at, stopped_at,
                             total_duration, user_id, tags, billable, location,
                             created_at, updated_at)
           VALUES ($1, $2, $3, 'STOPPED', $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(started_at)
    .bind(stopped_at)
    .bind(total_secs)
    .bind(&user_id)
    .bind(&tags)
    .bind(body.billable.unwrap_or(false))
    .bind(&body.location)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": id })))
}

async fn exec_link_create(
    pool: &PgPool,
    http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: CreateLinkRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid link body: {e}"))),
    };

    if body.url.trim().is_empty() {
        return JobExecOutcome::Fail(AppError::bad_request("URL is required"));
    }

    let allow_duplicates = body.allow_duplicates.unwrap_or(false);
    let should_extract = body.extract_metadata.unwrap_or(false)
        || body.title.is_none()
        || body.description.is_none();

    let mut title = body.title.clone();
    let mut description = body.description.clone();
    let mut favicon: Option<String> = None;
    let mut metadata: Option<serde_json::Value> = None;
    let mut metadata_extracted_at: Option<chrono::NaiveDateTime> = None;

    if should_extract {
        if let Ok(extracted) = extract_metadata_from_url(http, &body.url).await {
            let extracted_title = extracted.title.clone();
            let extracted_description = extracted.description.clone();
            let extracted_favicon = extracted.favicon.clone();

            if title.is_none() {
                title = extracted_title.clone();
            }
            if description.is_none() {
                description = extracted_description.clone();
            }
            favicon = extracted_favicon.clone();
            metadata_extracted_at = Some(chrono::Utc::now().naive_utc());
            metadata = Some(json!({
                "title": extracted_title,
                "description": extracted_description,
                "favicon": extracted_favicon,
            }));
        }
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let normalized = normalize_url(&body.url);

    if !allow_duplicates {
        let exact_duplicate_ids = match sqlx::query_scalar::<_, String>(
            "SELECT id FROM links WHERE user_id = $1 AND normalized_url = $2",
        )
        .bind(&user_id)
        .bind(&normalized)
        .fetch_all(&mut *tx)
        .await
        {
            Ok(v) => v,
            Err(e) => {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        };

        if !exact_duplicate_ids.is_empty() {
            let host = normalized.split('/').next().unwrap_or_default().to_string();
            let similar_link_ids = match sqlx::query_scalar::<_, String>(
                r#"SELECT id
                   FROM links
                   WHERE user_id = $1
                     AND split_part(normalized_url, '/', 1) = $2
                     AND normalized_url <> $3"#,
            )
            .bind(&user_id)
            .bind(&host)
            .bind(&normalized)
            .fetch_all(&mut *tx)
            .await
            {
                Ok(v) => v,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return map_sqlx_ticket(e);
                }
            };
            let _ = tx.rollback().await;
            return JobExecOutcome::Ok(JsonMutationResult::new(
                StatusCode::OK,
                json!({
                    "success": false,
                    "error": "A link with this exact URL already exists",
                    "duplicate_link_ids": exact_duplicate_ids,
                    "similar_link_ids": similar_link_ids,
                }),
            ));
        }
    }

    let id = new_cuid();
    let link_type = body.link_type.as_deref().unwrap_or("WEBSITE");
    let tags = body.tags.clone().unwrap_or_default();
    let is_favorite = body.is_favorite.unwrap_or(false);
    let title = title.unwrap_or_else(|| body.url.clone());

    let res = sqlx::query(
        r#"INSERT INTO links (id, title, url, normalized_url, description, favicon, link_type, tags,
                      notes, is_favorite, metadata, metadata_extracted_at, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::"LinkType", $8, $9, $10, $11, $12, $13, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&title)
    .bind(&body.url)
    .bind(&normalized)
    .bind(&description)
    .bind(&favicon)
    .bind(link_type)
    .bind(&tags)
    .bind(&body.notes)
    .bind(is_favorite)
    .bind(&metadata)
    .bind(metadata_extracted_at)
    .bind(&user_id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Some(ref collection_ids) = body.collection_ids {
        for cid in collection_ids {
            let lc_id = new_cuid();
            let _ = sqlx::query(
                "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
            )
            .bind(&lc_id)
            .bind(&id)
            .bind(cid)
            .execute(&mut *tx)
            .await;
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    if github_metadata::parse_github_owner_repo(&body.url).is_some()
        && !github_metadata::link_github_enrichment_matches_repo(&metadata, &body.url)
    {
        if let Err(e) = enqueue_github_link_metadata_job(&pool, &id, &user_id).await {
            warn!(
                event = "link.create.github_metadata_enqueue_failed",
                link_id = %id,
                error = %e,
                "could not enqueue GitHub metadata job after link create"
            );
        }
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": id })))
}
