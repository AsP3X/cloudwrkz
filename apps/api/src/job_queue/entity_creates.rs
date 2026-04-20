//! Persisted `background_jobs` workers for ticket / todo / time entry / link / collection mutations (creates, updates, deletes, ticket comments, time breaks and bulk time ops).
//! HTTP handlers enqueue and return HTTP 202; clients poll `GET /mutation-jobs/{id}` (see `routes/mutation_jobs.rs`).

use axum::http::StatusCode;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::{error, info, warn};

use crate::audit::{self, WriteAuditParams};
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
use crate::models::employee::{
    DepartmentCreateRequest, DepartmentUpdateRequest, DocumentCreateRequest,
    EmployeeAssetAssignRequest, EmployeeCertificationUpsertRequest,
    EmployeeCompensationUpsertRequest, EmployeeCreateRequest, EmployeeGoalCreateRequest,
    EmployeeLifecycleEventCreateRequest, EmployeePerformanceReviewCreateRequest,
    EmployeeSkillUpsertRequest, EmployeeUpdateRequest, LeaveRequestCreateRequest,
    LeaveRequestUpdateRequest,
};
use crate::models::link::{CreateLinkRequest, UpdateLinkRequest};
use crate::models::ticket::{TicketCommentCreateRequest, TicketCreateRequest, TicketUpdateRequest};
use crate::models::time_entry::{AddTimeEntryRequest, CreateTimeEntryRequest};
use crate::models::todo::{CreateTodoRequest, UpdateTodoRequest};
use crate::routes::helpers::{check_permission, check_permission_mut_tx};

use super::enqueue_github_link_metadata_job;

pub const JOB_TYPE_TICKET_CREATE: &str = "ticket_create";
pub const JOB_TYPE_TICKET_UPDATE: &str = "ticket_update";
pub const JOB_TYPE_TICKET_DELETE: &str = "ticket_delete";
pub const JOB_TYPE_TICKET_COMMENT_CREATE: &str = "ticket_comment_create";
pub const JOB_TYPE_TODO_CREATE: &str = "todo_create";
pub const JOB_TYPE_TODO_UPDATE: &str = "todo_update";
pub const JOB_TYPE_TODO_DELETE: &str = "todo_delete";
pub const JOB_TYPE_TIME_ENTRY_CREATE_TIMER: &str = "time_entry_create_timer";
pub const JOB_TYPE_TIME_ENTRY_CREATE_MANUAL: &str = "time_entry_create_manual";
pub const JOB_TYPE_TIME_ENTRY_UPDATE: &str = "time_entry_update";
pub const JOB_TYPE_TIME_ENTRY_DELETE: &str = "time_entry_delete";
pub const JOB_TYPE_TIME_ENTRY_STOP: &str = "time_entry_stop";
pub const JOB_TYPE_TIME_ENTRY_PAUSE: &str = "time_entry_pause";
pub const JOB_TYPE_TIME_ENTRY_RESUME: &str = "time_entry_resume";
pub const JOB_TYPE_TIME_ENTRY_COMPLETE: &str = "time_entry_complete";
pub const JOB_TYPE_TIME_ENTRY_BREAK_CREATE: &str = "time_entry_break_create";
pub const JOB_TYPE_TIME_ENTRY_BREAK_UPDATE: &str = "time_entry_break_update";
pub const JOB_TYPE_TIME_ENTRY_BREAK_DELETE: &str = "time_entry_break_delete";
pub const JOB_TYPE_TIME_ENTRY_BULK_UPDATE: &str = "time_entry_bulk_update";
pub const JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE: &str = "time_entry_bulk_archive";
pub const JOB_TYPE_TIME_ENTRY_BULK_DELETE: &str = "time_entry_bulk_delete";
pub const JOB_TYPE_LINK_CREATE: &str = "link_create";
pub const JOB_TYPE_LINK_UPDATE: &str = "link_update";
pub const JOB_TYPE_LINK_DELETE: &str = "link_delete";
pub const JOB_TYPE_COLLECTION_CREATE: &str = "collection_create";
pub const JOB_TYPE_COLLECTION_UPDATE: &str = "collection_update";
pub const JOB_TYPE_COLLECTION_DELETE: &str = "collection_delete";
pub const JOB_TYPE_EMPLOYEE_CREATE: &str = "employee_create";
pub const JOB_TYPE_EMPLOYEE_UPDATE: &str = "employee_update";
pub const JOB_TYPE_EMPLOYEE_DELETE: &str = "employee_delete";
pub const JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT: &str = "employee_compensation_upsert";
pub const JOB_TYPE_EMPLOYEE_ASSET_ASSIGN: &str = "employee_asset_assign";
pub const JOB_TYPE_EMPLOYEE_SKILL_UPSERT: &str = "employee_skill_upsert";
pub const JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT: &str = "employee_certification_upsert";
pub const JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE: &str = "employee_performance_review_create";
pub const JOB_TYPE_EMPLOYEE_GOAL_CREATE: &str = "employee_goal_create";
pub const JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE: &str = "employee_lifecycle_event_create";
pub const JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE: &str = "employee_leave_request_create";
pub const JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE: &str = "employee_leave_request_update";
pub const JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE: &str = "employee_document_create";
pub const JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE: &str = "employee_document_delete";
pub const JOB_TYPE_DEPARTMENT_CREATE: &str = "department_create";
pub const JOB_TYPE_DEPARTMENT_UPDATE: &str = "department_update";
pub const JOB_TYPE_DEPARTMENT_DELETE: &str = "department_delete";

pub const ENTITY_CREATE_POLL_DEADLINE_SECS: u32 = 120;

pub fn is_entity_create_job_type(job_type: &str) -> bool {
    matches!(
        job_type,
        JOB_TYPE_TICKET_CREATE
            | JOB_TYPE_TICKET_UPDATE
            | JOB_TYPE_TICKET_DELETE
            | JOB_TYPE_TICKET_COMMENT_CREATE
            | JOB_TYPE_TODO_CREATE
            | JOB_TYPE_TODO_UPDATE
            | JOB_TYPE_TODO_DELETE
            | JOB_TYPE_TIME_ENTRY_CREATE_TIMER
            | JOB_TYPE_TIME_ENTRY_CREATE_MANUAL
            | JOB_TYPE_TIME_ENTRY_UPDATE
            | JOB_TYPE_TIME_ENTRY_DELETE
            | JOB_TYPE_TIME_ENTRY_STOP
            | JOB_TYPE_TIME_ENTRY_PAUSE
            | JOB_TYPE_TIME_ENTRY_RESUME
            | JOB_TYPE_TIME_ENTRY_COMPLETE
            | JOB_TYPE_TIME_ENTRY_BREAK_CREATE
            | JOB_TYPE_TIME_ENTRY_BREAK_UPDATE
            | JOB_TYPE_TIME_ENTRY_BREAK_DELETE
            | JOB_TYPE_TIME_ENTRY_BULK_UPDATE
            | JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE
            | JOB_TYPE_TIME_ENTRY_BULK_DELETE
            | JOB_TYPE_LINK_CREATE
            | JOB_TYPE_LINK_UPDATE
            | JOB_TYPE_LINK_DELETE
            | JOB_TYPE_COLLECTION_CREATE
            | JOB_TYPE_COLLECTION_UPDATE
            | JOB_TYPE_COLLECTION_DELETE
            | JOB_TYPE_EMPLOYEE_CREATE
            | JOB_TYPE_EMPLOYEE_UPDATE
            | JOB_TYPE_EMPLOYEE_DELETE
            | JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT
            | JOB_TYPE_EMPLOYEE_ASSET_ASSIGN
            | JOB_TYPE_EMPLOYEE_SKILL_UPSERT
            | JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT
            | JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE
            | JOB_TYPE_EMPLOYEE_GOAL_CREATE
            | JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE
            | JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE
            | JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE
            | JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE
            | JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE
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
            message: Some("Request is still processing in the background job queue.".into()),
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

pub(super) enum JobExecOutcome {
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
        }
        JOB_TYPE_TODO_CREATE => exec_todo_create(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TODO_UPDATE => exec_todo_update(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TODO_DELETE => exec_todo_delete(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_TIME_ENTRY_CREATE_TIMER => {
            exec_time_entry_timer_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_TIME_ENTRY_CREATE_MANUAL => {
            exec_time_entry_manual_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_TIME_ENTRY_UPDATE => {
            super::time_entry_mutations::exec_time_entry_update(pool, lock_ms, stmt_ms, payload)
                .await
        }
        JOB_TYPE_TIME_ENTRY_DELETE => {
            super::time_entry_mutations::exec_time_entry_delete(pool, lock_ms, stmt_ms, payload)
                .await
        }
        JOB_TYPE_TIME_ENTRY_STOP => {
            super::time_entry_mutations::exec_time_entry_stop(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_TIME_ENTRY_PAUSE => {
            super::time_entry_mutations::exec_time_entry_pause(pool, lock_ms, stmt_ms, payload)
                .await
        }
        JOB_TYPE_TIME_ENTRY_RESUME => {
            super::time_entry_mutations::exec_time_entry_resume(pool, lock_ms, stmt_ms, payload)
                .await
        }
        JOB_TYPE_TIME_ENTRY_COMPLETE => {
            super::time_entry_mutations::exec_time_entry_complete(pool, lock_ms, stmt_ms, payload)
                .await
        }
        JOB_TYPE_TIME_ENTRY_BREAK_CREATE => {
            super::time_entry_mutations::exec_time_entry_break_create(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_TIME_ENTRY_BREAK_UPDATE => {
            super::time_entry_mutations::exec_time_entry_break_update(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_TIME_ENTRY_BREAK_DELETE => {
            super::time_entry_mutations::exec_time_entry_break_delete(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_TIME_ENTRY_BULK_UPDATE => {
            super::time_entry_mutations::exec_time_entry_bulk_update(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE => {
            super::time_entry_mutations::exec_time_entry_bulk_archive(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_TIME_ENTRY_BULK_DELETE => {
            super::time_entry_mutations::exec_time_entry_bulk_delete(
                pool, lock_ms, stmt_ms, payload,
            )
            .await
        }
        JOB_TYPE_LINK_CREATE => exec_link_create(pool, http, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_LINK_UPDATE => exec_link_update(pool, http, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_LINK_DELETE => exec_link_delete(pool, http, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_COLLECTION_CREATE => {
            exec_collection_create(pool, http, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_COLLECTION_UPDATE => {
            exec_collection_update(pool, http, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_COLLECTION_DELETE => {
            exec_collection_delete(pool, http, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_CREATE => exec_employee_create(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_EMPLOYEE_UPDATE => exec_employee_update(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_EMPLOYEE_DELETE => exec_employee_delete(pool, lock_ms, stmt_ms, payload).await,
        JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT => {
            exec_employee_compensation_upsert(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_ASSET_ASSIGN => {
            exec_employee_asset_assign(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_SKILL_UPSERT => {
            exec_employee_skill_upsert(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT => {
            exec_employee_certification_upsert(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE => {
            exec_employee_performance_review_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_GOAL_CREATE => {
            exec_employee_goal_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE => {
            exec_employee_lifecycle_event_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE => {
            exec_employee_leave_request_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE => {
            exec_employee_leave_request_update(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE => {
            exec_employee_document_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE => {
            exec_employee_document_delete(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_DEPARTMENT_CREATE => {
            exec_department_create(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_DEPARTMENT_UPDATE => {
            exec_department_update(pool, lock_ms, stmt_ms, payload).await
        }
        JOB_TYPE_DEPARTMENT_DELETE => {
            exec_department_delete(pool, lock_ms, stmt_ms, payload).await
        }
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

pub(super) fn map_sqlx_ticket(err: sqlx::Error) -> JobExecOutcome {
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: TicketCreateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid ticket body: {e}"
            )));
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: TicketUpdateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid ticket update: {e}"
            )));
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
        if let Err(e) =
            sqlx::query("UPDATE tickets SET description = $1, updated_at = NOW() WHERE id = $2")
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
        if let Err(e) =
            sqlx::query("UPDATE tickets SET assigned_to_id = $1, updated_at = NOW() WHERE id = $2")
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"));
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let ticket_id = match payload.get("ticket_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing ticket_id in job payload"));
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
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: TicketCommentCreateRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid comment body: {e}"
            )));
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: CreateTodoRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid todo body: {e}")));
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

async fn exec_todo_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let todo_id = match payload.get("todo_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing todo_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: UpdateTodoRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid todo update: {e}"
            )));
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

    let existing =
        match sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1 FOR UPDATE")
            .bind(&todo_id)
            .fetch_optional(&mut *tx)
            .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                let _ = tx.rollback().await;
                return JobExecOutcome::Fail(AppError::not_found("Todo not found"));
            }
            Err(e) => {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        };

    let owner: Option<String> = existing.get("assigned_to_id");
    if owner.as_deref() != Some(&user_id) {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden("Not your todo"));
    }

    if let Some(ref title) = body.title {
        if let Err(e) = sqlx::query("UPDATE todos SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(&todo_id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref desc) = body.description {
        if let Err(e) =
            sqlx::query("UPDATE todos SET description = $1, updated_at = NOW() WHERE id = $2")
                .bind(desc)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref desc_html) = body.description_html {
        if let Err(e) =
            sqlx::query("UPDATE todos SET description_html = $1, updated_at = NOW() WHERE id = $2")
                .bind(desc_html)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref aid) = body.assigned_to_id {
        let s: Option<String> = aid
            .as_str()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        if let Err(e) =
            sqlx::query("UPDATE todos SET assigned_to_id = $1, updated_at = NOW() WHERE id = $2")
                .bind(&s)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(est) = body.estimated_hours {
        if let Err(e) =
            sqlx::query("UPDATE todos SET estimated_hours = $1, updated_at = NOW() WHERE id = $2")
                .bind(est)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(act) = body.actual_hours {
        if let Err(e) =
            sqlx::query("UPDATE todos SET actual_hours = $1, updated_at = NOW() WHERE id = $2")
                .bind(act)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if body.start_date.is_some() {
        let v = body
            .start_date
            .as_ref()
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
        if let Err(e) =
            sqlx::query("UPDATE todos SET start_date = $1, updated_at = NOW() WHERE id = $2")
                .bind(&v)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if body.due_date.is_some() {
        let v = body
            .due_date
            .as_ref()
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<chrono::NaiveDateTime>().ok());
        if let Err(e) =
            sqlx::query("UPDATE todos SET due_date = $1, updated_at = NOW() WHERE id = $2")
                .bind(&v)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if body.ticket_id.is_some() {
        let v = body
            .ticket_id
            .as_ref()
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let Err(e) =
            sqlx::query("UPDATE todos SET ticket_id = $1, updated_at = NOW() WHERE id = $2")
                .bind(v)
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref status) = body.status {
        let completed_date = if status == "COMPLETED" {
            Some(chrono::Utc::now().naive_utc())
        } else {
            None
        };
        if let Err(e) = sqlx::query(
            r#"UPDATE todos SET status = $1::"TodoStatus", completed_date = $2, updated_at = NOW() WHERE id = $3"#,
        )
        .bind(status)
        .bind(completed_date)
        .bind(&todo_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref priority) = body.priority {
        if let Err(e) = sqlx::query(
            r#"UPDATE todos SET priority = $1::"TodoPriority", updated_at = NOW() WHERE id = $2"#,
        )
        .bind(priority)
        .bind(&todo_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if body.archived_at.is_some() {
        let set_null = body
            .archived_at
            .as_ref()
            .map(serde_json::Value::is_null)
            .unwrap_or(false);
        if set_null {
            if let Err(e) =
                sqlx::query("UPDATE todos SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                    .bind(&todo_id)
                    .execute(&mut *tx)
                    .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        } else if let Err(e) =
            sqlx::query("UPDATE todos SET archived_at = NOW(), updated_at = NOW() WHERE id = $1")
                .bind(&todo_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(order) = body.order {
        if let Err(e) =
            sqlx::query("UPDATE todos SET \"order\" = $1, updated_at = NOW() WHERE id = $2")
                .bind(order)
                .bind(&todo_id)
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
        "message": "Todo updated"
    })))
}

async fn exec_todo_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let todo_id = match payload.get("todo_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing todo_id in job payload"));
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

    let existing =
        match sqlx::query("SELECT id, assigned_to_id FROM todos WHERE id = $1 FOR UPDATE")
            .bind(&todo_id)
            .fetch_optional(&mut *tx)
            .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                let _ = tx.rollback().await;
                return JobExecOutcome::Fail(AppError::not_found("Todo not found"));
            }
            Err(e) => {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        };

    let owner: Option<String> = existing.get("assigned_to_id");
    if owner.as_deref() != Some(&user_id) {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden("Not your todo"));
    }

    if let Err(e) = sqlx::query("DELETE FROM todos WHERE parent_todo_id = $1")
        .bind(&todo_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query("DELETE FROM todos WHERE id = $1")
        .bind(&todo_id)
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
        "message": "Todo deleted"
    })))
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: CreateTimeEntryRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid time entry body: {e}"
            )));
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
    let now = body
        .started_at
        .as_deref()
        .and_then(parse_api_utc_naive_datetime)
        .unwrap_or_else(|| chrono::Utc::now().naive_utc());

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

fn parse_api_utc_naive_datetime(raw: &str) -> Option<chrono::NaiveDateTime> {
    let input = raw.trim();
    chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S%.f")
        .ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S").ok())
        .or_else(|| {
            chrono::DateTime::parse_from_rfc3339(input)
                .ok()
                .map(|dt| dt.with_timezone(&chrono::Utc).naive_utc())
        })
        .or_else(|| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
}

async fn exec_time_entry_manual_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: AddTimeEntryRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid manual time entry body: {e}"
            )));
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
    let total_secs =
        body.hours.unwrap_or(0) * 3600 + body.minutes.unwrap_or(0) * 60 + body.seconds.unwrap_or(0);

    let started_at = body
        .started_at
        .as_deref()
        .and_then(parse_api_utc_naive_datetime)
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
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: CreateLinkRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid link body: {e}")));
        }
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

#[derive(Debug, Deserialize)]
struct CreateCollectionJobRequest {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

fn collection_hex_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|x| x.is_ascii_hexdigit())
}

async fn exec_collection_create(
    pool: &PgPool,
    _http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };

    if !check_permission(pool, &user_id, "collections.create").await {
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to create collections",
        ));
    }

    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: CreateCollectionJobRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid collection body: {e}"
            )));
        }
    };

    let name = body.name.trim();
    if name.is_empty() {
        return JobExecOutcome::Fail(AppError::bad_request("Collection name is required"));
    }

    let color = match body.color.as_ref().map(|s| s.trim()) {
        None | Some("") => None,
        Some(c) => {
            if collection_hex_ok(c) {
                Some(c.to_string())
            } else {
                return JobExecOutcome::Fail(AppError::bad_request(
                    "Invalid color format. Use a hex color code (e.g. #3B82F6)",
                ));
            }
        }
    };

    let desc = body
        .description
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let id = new_cuid();
    let res = sqlx::query(
        r#"INSERT INTO collections (id, name, description, color, owner_id, archived_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(name)
    .bind(&desc)
    .bind(&color)
    .bind(&user_id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    let ip = payload
        .get("audit_ip")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let ua = payload
        .get("audit_user_agent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "collections.create".into(),
            resource_type: Some("collection".into()),
            resource_id: Some(id.clone()),
            context: None,
            ip_address: ip,
            user_agent: ua,
        },
    );

    JobExecOutcome::Ok(JsonMutationResult::created(json!({
        "id": id,
        "success": true
    })))
}

async fn collection_access_for_job(
    pool: &PgPool,
    user_id: &str,
    collection_id: &str,
) -> Result<(String, bool), AppError> {
    let row = sqlx::query(
        r#"SELECT c.owner_id,
                  EXISTS(SELECT 1 FROM collection_members cm WHERE cm.collection_id = c.id AND cm.user_id = $2) as is_member
           FROM collections c
           WHERE c.id = $1 AND c.archived_at IS NULL"#,
    )
    .bind(collection_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)?;

    let Some(row) = row else {
        return Err(AppError::not_found("Collection not found"));
    };

    let owner_id: String = row.get("owner_id");
    let is_member: bool = row.get("is_member");
    let is_owner = owner_id == user_id;
    if !is_owner && !is_member {
        return Err(AppError::forbidden(
            "You don't have access to this collection",
        ));
    }
    Ok((owner_id, is_owner))
}

async fn collection_is_editor_or_owner(
    pool: &PgPool,
    user_id: &str,
    collection_id: &str,
    owner_id: &str,
) -> Result<bool, AppError> {
    if owner_id == user_id {
        return Ok(true);
    }
    let role: Option<String> = sqlx::query_scalar(
        r#"SELECT role::text FROM collection_members
           WHERE collection_id = $1 AND user_id = $2"#,
    )
    .bind(collection_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)?;
    Ok(matches!(role.as_deref(), Some("EDITOR")))
}

#[derive(Debug, Deserialize)]
struct UpdateCollectionJobRequest {
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
}

async fn exec_collection_update(
    pool: &PgPool,
    _http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let collection_id = match payload.get("collection_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing collection_id in job payload",
            ));
        }
    };
    if !check_permission(pool, &user_id, "collections.update").await {
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to update collections",
        ));
    }
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: UpdateCollectionJobRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid collection update body: {e}"
            )));
        }
    };

    if body.name.is_none() && body.description.is_none() && body.color.is_none() {
        return JobExecOutcome::Fail(AppError::bad_request("No fields to update"));
    }
    if let Some(ref n) = body.name {
        if n.trim().is_empty() {
            return JobExecOutcome::Fail(AppError::bad_request("Collection name cannot be empty"));
        }
    }
    let color_val: Option<Option<String>> = match &body.color {
        None => None,
        Some(s) if s.trim().is_empty() => Some(None),
        Some(c) => {
            let t = c.trim();
            if collection_hex_ok(t) {
                Some(Some(t.to_string()))
            } else {
                return JobExecOutcome::Fail(AppError::bad_request(
                    "Invalid color format. Use a hex color code (e.g. #3B82F6)",
                ));
            }
        }
    };

    let (owner_id, _) = match collection_access_for_job(pool, &user_id, &collection_id).await {
        Ok(x) => x,
        Err(e) => return JobExecOutcome::Fail(e),
    };
    match collection_is_editor_or_owner(pool, &user_id, &collection_id, &owner_id).await {
        Ok(true) => {}
        Ok(false) => {
            return JobExecOutcome::Fail(AppError::forbidden(
                "You don't have permission to update this collection",
            ));
        }
        Err(e) => return JobExecOutcome::Fail(e),
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Some(ref n) = body.name {
        if let Err(e) =
            sqlx::query("UPDATE collections SET name = $1, updated_at = NOW() WHERE id = $2")
                .bind(n.trim())
                .bind(&collection_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if body.description.is_some() {
        let d = body
            .description
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        if let Err(e) =
            sqlx::query("UPDATE collections SET description = $1, updated_at = NOW() WHERE id = $2")
                .bind(&d)
                .bind(&collection_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(cv) = color_val {
        if let Err(e) =
            sqlx::query("UPDATE collections SET color = $1, updated_at = NOW() WHERE id = $2")
                .bind(&cv)
                .bind(&collection_id)
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

    let ip = payload
        .get("audit_ip")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let ua = payload
        .get("audit_user_agent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "collections.update".into(),
            resource_type: Some("collection".into()),
            resource_id: Some(collection_id.clone()),
            context: None,
            ip_address: ip,
            user_agent: ua,
        },
    );

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_collection_delete(
    pool: &PgPool,
    _http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let collection_id = match payload.get("collection_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing collection_id in job payload",
            ));
        }
    };
    if !check_permission(pool, &user_id, "collections.delete").await {
        return JobExecOutcome::Fail(AppError::forbidden(
            "You don't have permission to delete collections",
        ));
    }
    let (_owner_id, is_owner) =
        match collection_access_for_job(pool, &user_id, &collection_id).await {
            Ok(x) => x,
            Err(e) => return JobExecOutcome::Fail(e),
        };
    if !is_owner {
        return JobExecOutcome::Fail(AppError::forbidden(
            "Only the collection owner can delete it",
        ));
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query("DELETE FROM collections WHERE id = $1")
        .bind(&collection_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    let ip = payload
        .get("audit_ip")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let ua = payload
        .get("audit_user_agent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "collections.delete".into(),
            resource_type: Some("collection".into()),
            resource_id: Some(collection_id),
            context: None,
            ip_address: ip,
            user_agent: ua,
        },
    );

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_link_update(
    pool: &PgPool,
    _http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let link_id = match payload.get("link_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing link_id in job payload"));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: UpdateLinkRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid link update body: {e}"
            )));
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

    let existing = match sqlx::query("SELECT id, user_id FROM links WHERE id = $1 FOR UPDATE")
        .bind(&link_id)
        .fetch_optional(&mut *tx)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };
    let Some(existing) = existing else {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::not_found("Link not found"));
    };

    let owner: String = existing.get("user_id");
    if owner != user_id {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden("Not your link"));
    }

    let id = &link_id;
    if let Some(ref title) = body.title {
        if let Err(e) = sqlx::query("UPDATE links SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref url) = body.url {
        let normalized = normalize_url(url);
        if let Err(e) = sqlx::query(
            "UPDATE links SET url = $1, normalized_url = $2, updated_at = NOW() WHERE id = $3",
        )
        .bind(url)
        .bind(&normalized)
        .bind(id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref desc) = body.description {
        if let Err(e) =
            sqlx::query("UPDATE links SET description = $1, updated_at = NOW() WHERE id = $2")
                .bind(desc)
                .bind(id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref tags) = body.tags {
        if let Err(e) = sqlx::query("UPDATE links SET tags = $1, updated_at = NOW() WHERE id = $2")
            .bind(tags)
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(is_fav) = body.is_favorite {
        if let Err(e) =
            sqlx::query("UPDATE links SET is_favorite = $1, updated_at = NOW() WHERE id = $2")
                .bind(is_fav)
                .bind(id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            if let Err(e) =
                sqlx::query("UPDATE links SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                    .bind(id)
                    .execute(&mut *tx)
                    .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        } else if let Err(e) =
            sqlx::query("UPDATE links SET archived_at = NOW(), updated_at = NOW() WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref notes) = body.notes {
        if let Err(e) = sqlx::query("UPDATE links SET notes = $1, updated_at = NOW() WHERE id = $2")
            .bind(notes)
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref link_type) = body.link_type {
        if let Err(e) = sqlx::query(
            "UPDATE links SET link_type = $1::\"LinkType\", updated_at = NOW() WHERE id = $2",
        )
        .bind(link_type)
        .bind(id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref rating) = body.rating {
        if let Err(e) =
            sqlx::query("UPDATE links SET rating = $1, updated_at = NOW() WHERE id = $2")
                .bind(rating)
                .bind(id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }

    if let Some(ref collection_ids) = body.collection_ids {
        if let Err(e) = sqlx::query("DELETE FROM link_collections WHERE link_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
        for cid in collection_ids {
            let lc_id = new_cuid();
            if let Err(e) = sqlx::query(
                "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
            )
            .bind(&lc_id)
            .bind(id)
            .bind(cid)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({
        "success": true,
        "message": "Link updated"
    })))
}

async fn exec_link_delete(
    pool: &PgPool,
    _http: &Client,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    let link_id = match payload.get("link_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing link_id in job payload"));
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

    let existing = match sqlx::query("SELECT id, user_id FROM links WHERE id = $1 FOR UPDATE")
        .bind(&link_id)
        .fetch_optional(&mut *tx)
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    };
    let Some(existing) = existing else {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::not_found("Link not found"));
    };

    let owner: String = existing.get("user_id");
    if owner != user_id {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::forbidden("Not your link"));
    }

    if let Err(e) = sqlx::query("DELETE FROM links WHERE id = $1")
        .bind(&link_id)
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
        "message": "Link deleted"
    })))
}

fn parse_optional_date(raw: &Option<String>) -> Option<chrono::NaiveDate> {
    raw.as_deref()
        .and_then(|s| chrono::NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok())
}

fn parse_optional_datetime(raw: &Option<String>) -> Option<chrono::NaiveDateTime> {
    raw.as_deref().and_then(parse_api_utc_naive_datetime)
}

async fn require_employee_permission(
    pool: &PgPool,
    user_id: &str,
    perm: &str,
) -> Result<(), AppError> {
    if check_permission(pool, user_id, perm).await {
        Ok(())
    } else {
        Err(AppError::forbidden(
            "Missing employee permission for this operation",
        ))
    }
}

fn parse_employee_status(s: Option<&str>) -> &str {
    match s.unwrap_or("DRAFT") {
        "DRAFT" | "ACTIVE" | "ON_LEAVE" | "TERMINATED" => s.unwrap_or("DRAFT"),
        _ => "DRAFT",
    }
}

fn parse_employment_type(s: Option<&str>) -> &str {
    match s.unwrap_or("FULL_TIME") {
        "FULL_TIME" | "PART_TIME" | "CONTRACTOR" | "INTERN" | "TEMPORARY" => {
            s.unwrap_or("FULL_TIME")
        }
        _ => "FULL_TIME",
    }
}

async fn exec_employee_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.create").await {
        return JobExecOutcome::Fail(e);
    }

    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: EmployeeCreateRequest = match serde_json::from_value(body_val) {
        Ok(v) => v,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid employee body: {e}"
            )));
        }
    };
    if body.employee_code.trim().is_empty()
        || body.first_name.trim().is_empty()
        || body.last_name.trim().is_empty()
    {
        return JobExecOutcome::Fail(AppError::bad_request(
            "employee_code, first_name and last_name are required",
        ));
    }
    let hire_date = match chrono::NaiveDate::parse_from_str(body.hire_date.trim(), "%Y-%m-%d") {
        Ok(v) => v,
        Err(_) => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Invalid hire_date (expected YYYY-MM-DD)",
            ));
        }
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let id = new_cuid();
    let res = sqlx::query(
        r#"INSERT INTO employees (
            id, employee_code, user_id, first_name, last_name, display_name, work_email, personal_email, phone, date_of_birth,
            hire_date, termination_date, status, employment_type, department, job_title, legal_entity, location, manager_employee_id,
            emergency_contact, notes, payroll_external_id, metadata, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13::"EmploymentStatus", $14::"EmploymentType", $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $24, NOW(), NOW()
        )"#,
    )
    .bind(&id)
    .bind(body.employee_code.trim())
    .bind(&body.user_id)
    .bind(body.first_name.trim())
    .bind(body.last_name.trim())
    .bind(&body.display_name)
    .bind(&body.work_email)
    .bind(&body.personal_email)
    .bind(&body.phone)
    .bind(parse_optional_date(&body.date_of_birth))
    .bind(hire_date)
    .bind(parse_optional_date(&body.termination_date))
    .bind(parse_employee_status(body.status.as_deref()))
    .bind(parse_employment_type(body.employment_type.as_deref()))
    .bind(&body.department)
    .bind(&body.job_title)
    .bind(&body.legal_entity)
    .bind(&body.location)
    .bind(&body.manager_employee_id)
    .bind(&body.emergency_contact)
    .bind(&body.notes)
    .bind(&body.payroll_external_id)
    .bind(&body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await;
    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_employment_history (
            id, employee_id, event_type, title, department, location, manager_employee_id, effective_date, notes, created_by_user_id, created_at
        ) VALUES ($1, $2, 'HIRE', $3, $4, $5, $6, $7, $8, $9, NOW())"#,
    )
    .bind(new_cuid())
    .bind(&id)
    .bind(&body.job_title)
    .bind(&body.department)
    .bind(&body.location)
    .bind(&body.manager_employee_id)
    .bind(hire_date)
    .bind(&body.notes)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.create".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(id.clone()),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": id })))
}

async fn exec_employee_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.update").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let body: EmployeeUpdateRequest = match serde_json::from_value(body_val) {
        Ok(v) => v,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid employee update: {e}"
            )));
        }
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    let exists: Option<String> =
        match sqlx::query_scalar("SELECT id FROM employees WHERE id = $1 FOR UPDATE")
            .bind(&employee_id)
            .fetch_optional(&mut *tx)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        };
    if exists.is_none() {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::not_found("Employee not found"));
    }

    let status = body
        .status
        .as_deref()
        .map(|v| parse_employee_status(Some(v)));
    let employment_type = body
        .employment_type
        .as_deref()
        .map(|v| parse_employment_type(Some(v)));
    let res = sqlx::query(
        r#"UPDATE employees SET
             user_id = COALESCE($2, user_id),
             first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             display_name = COALESCE($5, display_name),
             work_email = COALESCE($6, work_email),
             personal_email = COALESCE($7, personal_email),
             phone = COALESCE($8, phone),
             date_of_birth = COALESCE($9, date_of_birth),
             hire_date = COALESCE($10, hire_date),
             termination_date = COALESCE($11, termination_date),
             status = COALESCE($12::"EmploymentStatus", status),
             employment_type = COALESCE($13::"EmploymentType", employment_type),
             department = COALESCE($14, department),
             job_title = COALESCE($15, job_title),
             legal_entity = COALESCE($16, legal_entity),
             location = COALESCE($17, location),
             manager_employee_id = COALESCE($18, manager_employee_id),
             emergency_contact = COALESCE($19, emergency_contact),
             notes = COALESCE($20, notes),
             payroll_external_id = COALESCE($21, payroll_external_id),
             metadata = COALESCE($22, metadata),
             updated_by_user_id = $23,
             updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(&employee_id)
    .bind(&body.user_id)
    .bind(&body.first_name)
    .bind(&body.last_name)
    .bind(&body.display_name)
    .bind(&body.work_email)
    .bind(&body.personal_email)
    .bind(&body.phone)
    .bind(parse_optional_date(&body.date_of_birth))
    .bind(parse_optional_date(&body.hire_date))
    .bind(parse_optional_date(&body.termination_date))
    .bind(status)
    .bind(employment_type)
    .bind(&body.department)
    .bind(&body.job_title)
    .bind(&body.legal_entity)
    .bind(&body.location)
    .bind(&body.manager_employee_id)
    .bind(&body.emergency_contact)
    .bind(&body.notes)
    .bind(&body.payroll_external_id)
    .bind(&body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await;
    if let Err(e) = res {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.update".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_employee_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.delete").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query("DELETE FROM employees WHERE id = $1")
        .bind(&employee_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.delete".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_employee_compensation_upsert(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) =
        require_employee_permission(pool, &user_id, "employees.compensation.manage").await
    {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeCompensationUpsertRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid compensation body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let effective_from =
        match chrono::NaiveDate::parse_from_str(body.effective_from.trim(), "%Y-%m-%d") {
            Ok(v) => v,
            Err(_) => {
                return JobExecOutcome::Fail(AppError::bad_request("Invalid effective_from date"));
            }
        };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query("UPDATE employee_compensation SET is_current = false, updated_at = NOW() WHERE employee_id = $1")
        .bind(&employee_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_compensation (
            id, employee_id, pay_frequency, amount_cents, currency, compensation_type, pay_grade, pay_band,
            effective_from, effective_to, is_current, metadata, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3::"CompensationPayFrequency", $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $12, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.pay_frequency)
    .bind(body.amount_cents)
    .bind(body.currency.unwrap_or_else(|| "USD".to_string()))
    .bind(body.compensation_type.unwrap_or_else(|| "BASE".to_string()))
    .bind(body.pay_grade)
    .bind(body.pay_band)
    .bind(effective_from)
    .bind(parse_optional_date(&body.effective_to))
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.compensation.upsert".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_employee_asset_assign(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.assets.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeAssetAssignRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee asset body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_assets (
            id, employee_id, asset_name, asset_tag, serial_number, category, assigned_at, due_back_at, status, notes, metadata,
            created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'ASSIGNED'::"AssetAssignmentStatus", $8, $9, $10, $10, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.asset_name.trim())
    .bind(body.asset_tag)
    .bind(body.serial_number)
    .bind(body.category)
    .bind(parse_optional_datetime(&body.due_back_at))
    .bind(body.notes)
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.assets.assign".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

async fn exec_employee_skill_upsert(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.skills.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeSkillUpsertRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee skill body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_skills (
            id, employee_id, skill_name, level, category, verified, last_used_at, notes, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW(), NOW())
        ON CONFLICT DO NOTHING"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.skill_name.trim())
    .bind(body.level)
    .bind(body.category)
    .bind(body.verified.unwrap_or(false))
    .bind(parse_optional_date(&body.last_used_at))
    .bind(body.notes)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.skills.upsert".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_employee_certification_upsert(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.skills.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeCertificationUpsertRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee certification body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_certifications (
            id, employee_id, certification_name, issuer, issued_at, expires_at, credential_id, verification_url,
            status, metadata, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.certification_name.trim())
    .bind(body.issuer)
    .bind(parse_optional_date(&body.issued_at))
    .bind(parse_optional_date(&body.expires_at))
    .bind(body.credential_id)
    .bind(body.verification_url)
    .bind(body.status.unwrap_or_else(|| "ACTIVE".to_string()))
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.certifications.upsert".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

async fn exec_employee_performance_review_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) =
        require_employee_permission(pool, &user_id, "employees.performance.manage").await
    {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeePerformanceReviewCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee performance body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_performance_reviews (
            id, employee_id, reviewer_employee_id, cycle_name, rating, summary, strengths, improvements, reviewed_at, metadata,
            created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.reviewer_employee_id)
    .bind(body.cycle_name.trim())
    .bind(body.rating)
    .bind(body.summary)
    .bind(body.strengths)
    .bind(body.improvements)
    .bind(parse_optional_date(&body.reviewed_at))
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.performance_reviews.create".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

async fn exec_employee_goal_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) =
        require_employee_permission(pool, &user_id, "employees.performance.manage").await
    {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeGoalCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee goal body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_goals (
            id, employee_id, title, description, status, target_date, progress_percent, metadata,
            created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.title.trim())
    .bind(body.description)
    .bind(body.status.unwrap_or_else(|| "NOT_STARTED".to_string()))
    .bind(parse_optional_date(&body.target_date))
    .bind(body.progress_percent.unwrap_or(0))
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.goals.create".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

async fn exec_employee_lifecycle_event_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload"));
        }
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.lifecycle.manage").await
    {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing employee_id in job payload",
            ));
        }
    };
    let body: EmployeeLifecycleEventCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => {
                return JobExecOutcome::Fail(AppError::bad_request(format!(
                    "Invalid employee lifecycle body: {e}"
                )));
            }
        },
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"));
        }
    };
    let event_type = match body.event_type.as_str() {
        "ONBOARDING" | "OFFBOARDING" | "GENERAL" => body.event_type,
        _ => "GENERAL".to_string(),
    };
    let status = match body.status.as_deref() {
        Some("NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") => {
            body.status.unwrap_or_else(|| "NOT_STARTED".to_string())
        }
        _ => "NOT_STARTED".to_string(),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_lifecycle_events (
            id, employee_id, event_type, status, title, description, due_at, completed_at, owner_user_id, metadata,
            created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3::"LifecycleEventType", $4::"LifecycleEventStatus", $5, $6, $7, NULL, $8, $9, $10, $10, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(event_type)
    .bind(status)
    .bind(body.title.trim())
    .bind(body.description)
    .bind(parse_optional_datetime(&body.due_at))
    .bind(body.owner_user_id)
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "employees.lifecycle_events.create".into(),
            resource_type: Some("employee".into()),
            resource_id: Some(employee_id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

// Human: Creates a leave request row with PENDING status. Validates leave_type enum membership.
// Agent: WRITES employee_leave_requests; REQUIRES employees.leave.manage; VALIDATES leave_type against allowed values.
async fn exec_employee_leave_request_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.leave.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing employee_id in job payload")),
    };
    let body: LeaveRequestCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid leave request body: {e}"))),
        },
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload")),
    };

    let valid_types = ["VACATION", "SICK", "PERSONAL", "MATERNITY", "PATERNITY",
                       "BEREAVEMENT", "UNPAID", "COMPENSATORY", "OTHER"];
    let leave_type = if valid_types.contains(&body.leave_type.as_str()) {
        body.leave_type.clone()
    } else {
        "OTHER".to_string()
    };

    let start = match parse_optional_date(&Some(body.start_date.clone())) {
        Some(d) => d,
        None => return JobExecOutcome::Fail(AppError::bad_request("Invalid start_date format")),
    };
    let end = match parse_optional_date(&Some(body.end_date.clone())) {
        Some(d) => d,
        None => return JobExecOutcome::Fail(AppError::bad_request("Invalid end_date format")),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_leave_requests
            (id, employee_id, leave_type, start_date, end_date, status, reason, notes, metadata,
             created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3::"LeaveType", $4, $5, 'PENDING'::"LeaveRequestStatus",
                   $6, $7, $8, $9, $9, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(leave_type)
    .bind(start)
    .bind(end)
    .bind(body.reason)
    .bind(body.notes)
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.leave_requests.create".into(),
        resource_type: Some("employee".into()),
        resource_id: Some(employee_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

// Human: Updates a leave request status (APPROVED, DENIED, CANCELLED) and sets approval metadata.
// Agent: WRITES status, approved_by_user_id, approved_at, rejection_reason; REQUIRES leave.approve for APPROVED/DENIED.
async fn exec_employee_leave_request_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let leave_id = match payload.get("leave_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing leave_id in job payload")),
    };
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing employee_id")),
    };
    let body: LeaveRequestUpdateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid leave update body: {e}"))),
        },
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing request")),
    };

    // Human: Approval/denial requires dedicated approve permission; cancellation only needs manage.
    let new_status = body.status.as_deref().unwrap_or("CANCELLED");
    let needs_approve = matches!(new_status, "APPROVED" | "DENIED");
    if needs_approve {
        if let Err(e) = require_employee_permission(pool, &user_id, "employees.leave.approve").await {
            return JobExecOutcome::Fail(e);
        }
    } else {
        let has_perm = check_permission(pool, &user_id, "employees.leave.manage").await
            || check_permission(pool, &user_id, "employees.leave.approve").await;
        if !has_perm {
            return JobExecOutcome::Fail(AppError::forbidden("Insufficient permission to update leave request"));
        }
    }

    let valid_statuses = ["PENDING", "APPROVED", "DENIED", "CANCELLED"];
    let status = if valid_statuses.contains(&new_status) {
        new_status.to_string()
    } else {
        "CANCELLED".to_string()
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"UPDATE employee_leave_requests SET
             status = $2::"LeaveRequestStatus",
             rejection_reason = CASE WHEN $2 = 'DENIED' THEN $3 ELSE rejection_reason END,
             approved_by_user_id = CASE WHEN $2 IN ('APPROVED','DENIED') THEN $4 ELSE approved_by_user_id END,
             approved_at = CASE WHEN $2 IN ('APPROVED','DENIED') THEN NOW() ELSE approved_at END,
             notes = COALESCE($5, notes),
             updated_by_user_id = $4,
             updated_at = NOW()
           WHERE id = $1 AND employee_id = $6"#,
    )
    .bind(&leave_id)
    .bind(&status)
    .bind(body.rejection_reason)
    .bind(&user_id)
    .bind(body.notes)
    .bind(&employee_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: format!("employees.leave_requests.{}", status.to_lowercase()),
        resource_type: Some("employee_leave_request".into()),
        resource_id: Some(leave_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

// Human: Creates a document record for an employee. doc_type defaults to GENERAL if not provided.
// Agent: WRITES employee_documents; REQUIRES documents.manage; url field is caller-supplied (no upload).
async fn exec_employee_document_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.documents.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing employee_id")),
    };
    let body: DocumentCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid document body: {e}"))),
        },
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing request")),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO employee_documents
            (id, employee_id, doc_type, title, description, url, file_name, status,
             expires_at, metadata, created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE'::"DocumentStatus",
                   $8, $9, $10, $10, NOW(), NOW())"#,
    )
    .bind(new_cuid())
    .bind(&employee_id)
    .bind(body.doc_type.unwrap_or_else(|| "GENERAL".to_string()))
    .bind(body.title.trim())
    .bind(body.description)
    .bind(body.url)
    .bind(body.file_name)
    .bind(parse_optional_date(&body.expires_at))
    .bind(body.metadata)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.documents.create".into(),
        resource_type: Some("employee".into()),
        resource_id: Some(employee_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "success": true })))
}

// Human: Deletes an employee document row by doc_id. Cascades no children (documents are leaf nodes).
// Agent: DELETES employee_documents WHERE id = $1 AND employee_id = $2; REQUIRES documents.manage.
async fn exec_employee_document_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.documents.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let employee_id = match payload.get("employee_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing employee_id")),
    };
    let doc_id = match payload.get("doc_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing doc_id")),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        "DELETE FROM employee_documents WHERE id = $1 AND employee_id = $2",
    )
    .bind(&doc_id)
    .bind(&employee_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.documents.delete".into(),
        resource_type: Some("employee_document".into()),
        resource_id: Some(doc_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

// Human: Creates a new department record.
// Agent: INSERT INTO departments; REQUIRES employees.departments.manage.
async fn exec_department_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.departments.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let body: DepartmentCreateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid department body: {e}"))),
        },
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing request")),
    };

    let dept_id = new_cuid();
    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"INSERT INTO departments
            (id, name, description, manager_employee_id, parent_department_id, color, status,
             created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7, NOW(), NOW())"#,
    )
    .bind(&dept_id)
    .bind(body.name.trim())
    .bind(body.description)
    .bind(body.manager_employee_id)
    .bind(body.parent_department_id)
    .bind(body.color)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.departments.create".into(),
        resource_type: Some("department".into()),
        resource_id: Some(dept_id.clone()),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": dept_id })))
}

// Human: Updates a department record by id.
// Agent: UPDATE departments SET ... WHERE id = $dept_id; REQUIRES employees.departments.manage.
async fn exec_department_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.departments.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let dept_id = match payload.get("dept_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing dept_id")),
    };
    let body: DepartmentUpdateRequest = match payload.get("request").cloned() {
        Some(v) => match serde_json::from_value(v) {
            Ok(v) => v,
            Err(e) => return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid department update body: {e}"))),
        },
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing request")),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query(
        r#"UPDATE departments SET
            name                 = COALESCE($2, name),
            description          = COALESCE($3, description),
            manager_employee_id  = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE manager_employee_id END,
            parent_department_id = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE parent_department_id END,
            color                = COALESCE($6, color),
            status               = COALESCE($7, status),
            updated_by_user_id   = $8,
            updated_at           = NOW()
           WHERE id = $1"#,
    )
    .bind(&dept_id)
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.description)
    .bind(body.manager_employee_id)
    .bind(body.parent_department_id)
    .bind(body.color)
    .bind(body.status)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.departments.update".into(),
        resource_type: Some("department".into()),
        resource_id: Some(dept_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

// Human: Deletes a department record. Does not delete employees – they keep their department string.
// Agent: DELETE FROM departments WHERE id = $1; REQUIRES employees.departments.manage.
async fn exec_department_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id")),
    };
    if let Err(e) = require_employee_permission(pool, &user_id, "employees.departments.manage").await {
        return JobExecOutcome::Fail(e);
    }
    let dept_id = match payload.get("dept_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing dept_id")),
    };

    let mut tx = match pool.begin().await {
        Ok(v) => v,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = sqlx::query("DELETE FROM departments WHERE id = $1")
        .bind(&dept_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }
    audit::write_audit_log(pool, WriteAuditParams {
        user_id: Some(user_id),
        action: "employees.departments.delete".into(),
        resource_type: Some("department".into()),
        resource_id: Some(dept_id),
        context: None, ip_address: None, user_agent: None,
    });
    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}
