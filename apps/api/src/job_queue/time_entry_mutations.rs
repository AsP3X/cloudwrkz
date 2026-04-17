//! Time entry PATCH/DELETE/timer/break/bulk mutations for `background_jobs` (invoked from `entity_creates`).

use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Postgres, Row};

use crate::command_queue::{JsonMutationResult, apply_mutation_tx_settings};
use crate::error::AppError;
use crate::id::new_cuid;
use crate::models::time_entry::{
    CreateBreakRequest, TimeEntryRow, UpdateBreakRequest, UpdateTimeEntryRequest,
};

use super::entity_creates::{JobExecOutcome, map_sqlx_ticket};

const ENTRY_SELECT: &str = r#"SELECT id, name, description, status::text as status,
       started_at, paused_at, stopped_at, completed_at,
       total_duration, last_resumed_at, user_id, ticket_id,
       tags, billable, location, timezone, archived_at,
       created_at, updated_at"#;

fn row_to_entry(r: &sqlx::postgres::PgRow) -> TimeEntryRow {
    TimeEntryRow {
        id: r.get("id"),
        name: r.get("name"),
        description: r.get("description"),
        status: r.get("status"),
        started_at: r.get("started_at"),
        paused_at: r.get("paused_at"),
        stopped_at: r.get("stopped_at"),
        completed_at: r.get("completed_at"),
        total_duration: r.get("total_duration"),
        last_resumed_at: r.get("last_resumed_at"),
        user_id: r.get("user_id"),
        ticket_id: r.get("ticket_id"),
        tags: r.get("tags"),
        billable: r.get("billable"),
        location: r.get("location"),
        timezone: r.get("timezone"),
        archived_at: r.get("archived_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }
}

fn parse_iso_datetime_utc_naive(s: &str) -> Option<chrono::NaiveDateTime> {
    chrono::DateTime::parse_from_rfc3339(s.trim())
        .ok()
        .map(|dt| dt.naive_utc())
}

async fn lock_time_entry_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    id: &str,
    user_id: &str,
) -> Result<(), AppError> {
    let row = sqlx::query("SELECT user_id FROM time_entries WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| AppError::not_found("Time entry not found"))?;
    let owner: String = row.get("user_id");
    if owner != user_id {
        return Err(AppError::forbidden("Not your time entry"));
    }
    Ok(())
}

async fn fetch_owned_locked_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    id: &str,
    user_id: &str,
) -> Result<TimeEntryRow, AppError> {
    let sql = format!("{ENTRY_SELECT} FROM time_entries WHERE id = $1 AND user_id = $2 FOR UPDATE");
    let row = sqlx::query(&sql)
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| AppError::not_found("Time entry not found"))?;
    Ok(row_to_entry(&row))
}

#[derive(Debug, Deserialize)]
struct BulkUpdateTimeEntriesRequest {
    ids: Vec<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BulkIdsRequest {
    ids: Vec<String>,
}

pub(super) async fn exec_time_entry_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: UpdateTimeEntryRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid time entry update: {e}"
            )))
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

    let existing = match fetch_owned_locked_tx(&mut tx, &time_entry_id, &user_id).await {
        Ok(r) => r,
        Err(ae) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(ae);
        }
    };

    if let Some(ref name) = body.name {
        if let Err(e) = sqlx::query("UPDATE time_entries SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name)
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref desc) = body.description {
        if let Err(e) = sqlx::query(
            "UPDATE time_entries SET description = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(desc)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref tags) = body.tags {
        if let Err(e) = sqlx::query(
            "UPDATE time_entries SET tags = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(tags)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(ref loc) = body.location {
        if let Err(e) = sqlx::query(
            "UPDATE time_entries SET location = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(loc)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }
    if let Some(billable) = body.billable {
        if let Err(e) = sqlx::query(
            "UPDATE time_entries SET billable = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(billable)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }

    match body.timezone.as_ref() {
        Some(value) if value.is_null() => {
            if let Err(e) = sqlx::query(
                "UPDATE time_entries SET timezone = NULL, updated_at = NOW() WHERE id = $1",
            )
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        }
        Some(value) => {
            if let Some(tz_str) = value.as_str() {
                if let Err(e) = sqlx::query(
                    "UPDATE time_entries SET timezone = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(tz_str)
                .bind(&time_entry_id)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return map_sqlx_ticket(e);
                }
            }
        }
        None => {}
    }

    let started_at_update = match body.started_at.as_deref() {
        Some(raw) => match parse_iso_datetime_utc_naive(raw) {
            Some(dt) => Some(dt),
            None => {
                let _ = tx.rollback().await;
                return JobExecOutcome::Fail(AppError::bad_request(
                    "Invalid started_at timestamp (expected ISO-8601 / RFC3339)",
                ));
            }
        },
        None => None,
    };

    let stopped_at_update: Option<Option<chrono::NaiveDateTime>> = match body.stopped_at.as_ref() {
        None => None,
        Some(value) if value.is_null() => Some(None),
        Some(value) => {
            let raw = match value.as_str() {
                Some(s) => s,
                None => {
                    let _ = tx.rollback().await;
                    return JobExecOutcome::Fail(AppError::bad_request(
                        "Invalid stopped_at value (expected ISO-8601 string or null)",
                    ));
                }
            };
            let parsed = match parse_iso_datetime_utc_naive(raw) {
                Some(dt) => dt,
                None => {
                    let _ = tx.rollback().await;
                    return JobExecOutcome::Fail(AppError::bad_request(
                        "Invalid stopped_at timestamp (expected ISO-8601 / RFC3339)",
                    ));
                }
            };
            Some(Some(parsed))
        }
    };

    if started_at_update.is_some() || stopped_at_update.is_some() {
        let final_started = started_at_update.unwrap_or(existing.started_at);
        let final_stopped = stopped_at_update.unwrap_or(existing.stopped_at);
        let recalculated_duration = final_stopped
            .map(|stop| stop.signed_duration_since(final_started).num_seconds())
            .unwrap_or(existing.total_duration as i64);

        if recalculated_duration < 0 {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(AppError::bad_request("End time must be after start time"));
        }

        if let Err(e) = sqlx::query(
            "UPDATE time_entries SET started_at = $1, stopped_at = $2, total_duration = $3, updated_at = NOW() WHERE id = $4",
        )
        .bind(final_started)
        .bind(final_stopped)
        .bind(recalculated_duration as i32)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }

    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            if let Err(e) = sqlx::query(
                "UPDATE time_entries SET archived_at = NULL, updated_at = NOW() WHERE id = $1",
            )
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        } else if let Err(e) = sqlx::query(
            "UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1",
        )
        .bind(&time_entry_id)
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

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
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

    if let Err(ae) = lock_time_entry_tx(&mut tx, &time_entry_id, &user_id).await {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(ae);
    }

    if let Err(e) = sqlx::query("DELETE FROM time_entries WHERE id = $1")
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_stop(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
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

    let entry = match fetch_owned_locked_tx(&mut tx, &time_entry_id, &user_id).await {
        Ok(r) => r,
        Err(ae) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(ae);
        }
    };
    if entry.status != "RUNNING" && entry.status != "PAUSED" {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::bad_request("Timer is not running or paused"));
    }
    let now = Utc::now().naive_utc();
    let additional = if entry.status == "RUNNING" {
        entry
            .last_resumed_at
            .map(|lr| now.signed_duration_since(lr).num_seconds() as i32)
            .unwrap_or(0)
    } else {
        0
    };
    if let Err(e) = sqlx::query(
        "UPDATE time_entries SET status = 'STOPPED', stopped_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    )
    .bind(now)
    .bind(additional)
    .bind(&time_entry_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_pause(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
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

    let entry = match fetch_owned_locked_tx(&mut tx, &time_entry_id, &user_id).await {
        Ok(r) => r,
        Err(ae) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(ae);
        }
    };
    if entry.status != "RUNNING" {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::bad_request("Timer is not running"));
    }
    let now = Utc::now().naive_utc();
    let additional = entry
        .last_resumed_at
        .map(|lr| now.signed_duration_since(lr).num_seconds() as i32)
        .unwrap_or(0);
    if let Err(e) = sqlx::query(
        "UPDATE time_entries SET status = 'PAUSED', paused_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    )
    .bind(now)
    .bind(additional)
    .bind(&time_entry_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_resume(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
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

    let entry = match fetch_owned_locked_tx(&mut tx, &time_entry_id, &user_id).await {
        Ok(r) => r,
        Err(ae) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(ae);
        }
    };
    if entry.status != "PAUSED" {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::bad_request("Timer is not paused"));
    }
    let now = Utc::now().naive_utc();
    if let Err(e) = sqlx::query(
        "UPDATE time_entries SET status = 'RUNNING', last_resumed_at = $1, paused_at = NULL, updated_at = NOW() WHERE id = $2",
    )
    .bind(now)
    .bind(&time_entry_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_complete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
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

    let entry = match fetch_owned_locked_tx(&mut tx, &time_entry_id, &user_id).await {
        Ok(r) => r,
        Err(ae) => {
            let _ = tx.rollback().await;
            return JobExecOutcome::Fail(ae);
        }
    };
    if entry.status != "STOPPED" {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(AppError::bad_request("Timer must be stopped first"));
    }
    let now = Utc::now().naive_utc();
    if let Err(e) = sqlx::query(
        "UPDATE time_entries SET status = 'COMPLETED', completed_at = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(now)
    .bind(&time_entry_id)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_break_create(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
        }
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: CreateBreakRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid break body: {e}")))
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

    if let Err(ae) = lock_time_entry_tx(&mut tx, &time_entry_id, &user_id).await {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(ae);
    }

    let break_id = new_cuid();
    let started_at = body
        .started_at
        .as_deref()
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
        .unwrap_or_else(|| Utc::now().naive_utc());
    let ended_at = body.ended_at.as_deref().and_then(|s| {
        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
    });
    let duration = ended_at
        .map(|e| e.signed_duration_since(started_at).num_seconds() as i32)
        .unwrap_or(0);

    if let Err(e) = sqlx::query(
        "INSERT INTO time_entry_breaks (id, time_entry_id, started_at, ended_at, duration, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(&break_id)
    .bind(&time_entry_id)
    .bind(started_at)
    .bind(ended_at)
    .bind(duration)
    .bind(&body.description)
    .execute(&mut *tx)
    .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::created(json!({ "id": break_id })))
}

pub(super) async fn exec_time_entry_break_update(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
        }
    };
    let break_id = match payload.get("break_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing break_id in job payload")),
    };
    let body_val = match payload.get("request") {
        Some(v) => v.clone(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request("Missing request in job payload"))
        }
    };
    let body: UpdateBreakRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid break update: {e}"
            )))
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

    if let Err(ae) = lock_time_entry_tx(&mut tx, &time_entry_id, &user_id).await {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(ae);
    }

    if let Some(ref raw) = body.started_at {
        let parsed = match parse_iso_datetime_utc_naive(raw) {
            Some(dt) => dt,
            None => {
                let _ = tx.rollback().await;
                return JobExecOutcome::Fail(AppError::bad_request("Invalid started_at timestamp"));
            }
        };
        if let Err(e) = sqlx::query(
            "UPDATE time_entry_breaks SET started_at = $1, updated_at = NOW() WHERE id = $2 AND time_entry_id = $3",
        )
        .bind(parsed)
        .bind(&break_id)
        .bind(&time_entry_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return map_sqlx_ticket(e);
        }
    }

    match body.ended_at.as_ref() {
        Some(value) if value.is_null() => {
            if let Err(e) = sqlx::query(
                "UPDATE time_entry_breaks SET ended_at = NULL, duration = 0, updated_at = NOW() WHERE id = $1 AND time_entry_id = $2",
            )
            .bind(&break_id)
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        }
        Some(value) => {
            let raw = match value.as_str() {
                Some(s) => s,
                None => {
                    let _ = tx.rollback().await;
                    return JobExecOutcome::Fail(AppError::bad_request("Invalid ended_at value"));
                }
            };
            let parsed = match parse_iso_datetime_utc_naive(raw) {
                Some(dt) => dt,
                None => {
                    let _ = tx.rollback().await;
                    return JobExecOutcome::Fail(AppError::bad_request("Invalid ended_at timestamp"));
                }
            };
            let row = match sqlx::query(
                "SELECT started_at FROM time_entry_breaks WHERE id = $1 AND time_entry_id = $2",
            )
            .bind(&break_id)
            .bind(&time_entry_id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return map_sqlx_ticket(e);
                }
            };
            let started: chrono::NaiveDateTime = row.get("started_at");
            let dur = parsed.signed_duration_since(started).num_seconds() as i32;
            if let Err(e) = sqlx::query(
                "UPDATE time_entry_breaks SET ended_at = $1, duration = $2, updated_at = NOW() WHERE id = $3 AND time_entry_id = $4",
            )
            .bind(parsed)
            .bind(dur)
            .bind(&break_id)
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
            {
                let _ = tx.rollback().await;
                return map_sqlx_ticket(e);
            }
        }
        None => {}
    }

    if let Some(ref desc) = body.description {
        if let Err(e) = sqlx::query(
            "UPDATE time_entry_breaks SET description = $1, updated_at = NOW() WHERE id = $2 AND time_entry_id = $3",
        )
        .bind(desc)
        .bind(&break_id)
        .bind(&time_entry_id)
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

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_break_delete(
    pool: &PgPool,
    lock_ms: u64,
    stmt_ms: u64,
    payload: &serde_json::Value,
) -> JobExecOutcome {
    let user_id = match payload.get("user_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing user_id in job payload")),
    };
    let time_entry_id = match payload.get("time_entry_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            return JobExecOutcome::Fail(AppError::bad_request(
                "Missing time_entry_id in job payload",
            ))
        }
    };
    let break_id = match payload.get("break_id").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return JobExecOutcome::Fail(AppError::bad_request("Missing break_id in job payload")),
    };

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    if let Err(ae) = lock_time_entry_tx(&mut tx, &time_entry_id, &user_id).await {
        let _ = tx.rollback().await;
        return JobExecOutcome::Fail(ae);
    }

    if let Err(e) =
        sqlx::query("DELETE FROM time_entry_breaks WHERE id = $1 AND time_entry_id = $2")
            .bind(&break_id)
            .bind(&time_entry_id)
            .execute(&mut *tx)
            .await
    {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }
    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_bulk_update(
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
    let body: BulkUpdateTimeEntriesRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!("Invalid bulk update: {e}")))
        }
    };
    let status = match body.status.as_deref() {
        Some("RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED") => body.status.clone().unwrap(),
        _ => return JobExecOutcome::Fail(AppError::bad_request("Invalid or missing status")),
    };
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    for id in sorted_ids {
        if lock_time_entry_tx(&mut tx, &id, &user_id).await.is_ok() {
            let _ = sqlx::query(
                "UPDATE time_entries SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
            )
            .bind(&status)
            .bind(&id)
            .bind(&user_id)
            .execute(&mut *tx)
            .await;
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_bulk_archive(
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
    let body: BulkIdsRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid bulk archive: {e}"
            )))
        }
    };
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    for id in sorted_ids {
        if lock_time_entry_tx(&mut tx, &id, &user_id).await.is_ok() {
            let _ = sqlx::query(
                "UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2",
            )
            .bind(&id)
            .bind(&user_id)
            .execute(&mut *tx)
            .await;
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}

pub(super) async fn exec_time_entry_bulk_delete(
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
    let body: BulkIdsRequest = match serde_json::from_value(body_val) {
        Ok(b) => b,
        Err(e) => {
            return JobExecOutcome::Fail(AppError::bad_request(format!(
                "Invalid bulk delete: {e}"
            )))
        }
    };
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return map_sqlx_ticket(e),
    };
    if let Err(e) = apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms).await {
        let _ = tx.rollback().await;
        return map_sqlx_ticket(e);
    }

    for id in sorted_ids {
        if lock_time_entry_tx(&mut tx, &id, &user_id).await.is_ok() {
            let _ = sqlx::query("DELETE FROM time_entries WHERE id = $1 AND user_id = $2")
                .bind(&id)
                .bind(&user_id)
                .execute(&mut *tx)
                .await;
        }
    }

    if let Err(e) = tx.commit().await {
        return map_sqlx_ticket(e);
    }

    JobExecOutcome::Ok(JsonMutationResult::ok(json!({ "success": true })))
}
