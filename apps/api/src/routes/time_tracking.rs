use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::time_entry::*;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/time-tracking", get(list_entries).post(create_entry))
        .route("/time-tracking/active", get(active_entries))
        .route("/time-tracking/add", post(add_manual_entry))
        .route("/time-tracking/bulk-update", post(bulk_update_entries))
        .route("/time-tracking/bulk-archive", post(bulk_archive_entries))
        .route("/time-tracking/bulk-delete", post(bulk_delete_entries))
        .route(
            "/time-tracking/{id}",
            get(get_entry)
                .patch(update_entry)
                .delete(delete_entry),
        )
        .route("/time-tracking/{id}/stop", post(stop_entry))
        .route("/time-tracking/{id}/pause", post(pause_entry))
        .route("/time-tracking/{id}/resume", post(resume_entry))
        .route("/time-tracking/{id}/complete", post(complete_entry))
        .route("/time-tracking/{id}/breaks", post(add_break))
        .route(
            "/time-tracking/{id}/breaks/{break_id}",
            axum::routing::delete(delete_break),
        )
}

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

fn row_to_break(r: &sqlx::postgres::PgRow) -> TimeEntryBreakRow {
    TimeEntryBreakRow {
        id: r.get("id"),
        time_entry_id: r.get("time_entry_id"),
        started_at: r.get("started_at"),
        ended_at: r.get("ended_at"),
        duration: r.get("duration"),
        description: r.get("description"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }
}

async fn fetch_breaks(pool: &sqlx::PgPool, entry_id: &str) -> Vec<TimeEntryBreakRow> {
    sqlx::query(
        "SELECT id, time_entry_id, started_at, ended_at, duration, description, created_at, updated_at
         FROM time_entry_breaks WHERE time_entry_id = $1 ORDER BY started_at ASC",
    )
    .bind(entry_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .iter()
    .map(row_to_break)
    .collect()
}

async fn list_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TimeEntryListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let archive = params.archive.as_deref().unwrap_or("unarchived");
    let status = params.status.clone();
    let _ = (&params.sort, &params.date_from, &params.date_to);

    let sql = format!(
        "{ENTRY_SELECT} FROM time_entries
         WHERE user_id = $1
           AND ($2::text IS NULL OR status::text = $2)
           AND (($3 = 'archived' AND archived_at IS NOT NULL) OR ($3 != 'archived' AND archived_at IS NULL))
         ORDER BY created_at DESC"
    );

    let rows = sqlx::query(&sql)
        .bind(&user.id)
        .bind(&status)
        .bind(archive)
        .fetch_all(&state.pool)
        .await?;

    let mut result = Vec::with_capacity(rows.len());
    for r in &rows {
        let entry = row_to_entry(r);
        let breaks = fetch_breaks(&state.pool, &entry.id).await;
        result.push(TimeEntryWithBreaks { entry, breaks });
    }

    Ok(Json(serde_json::json!({ "timeEntries": result })))
}

async fn active_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let sql = format!(
        "{ENTRY_SELECT} FROM time_entries
         WHERE user_id = $1 AND status IN ('RUNNING', 'PAUSED')
         ORDER BY started_at DESC"
    );

    let rows = sqlx::query(&sql)
        .bind(&user.id)
        .fetch_all(&state.pool)
        .await?;

    let mut result = Vec::with_capacity(rows.len());
    for r in &rows {
        let entry = row_to_entry(r);
        let breaks = fetch_breaks(&state.pool, &entry.id).await;
        result.push(TimeEntryWithBreaks { entry, breaks });
    }

    Ok(Json(serde_json::json!({ "timeEntries": result })))
}

async fn get_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let sql = format!("{ENTRY_SELECT} FROM time_entries WHERE id = $1 AND user_id = $2");
    let row = sqlx::query(&sql)
        .bind(&id)
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Time entry not found"))?;

    let entry = row_to_entry(&row);
    let breaks = fetch_breaks(&state.pool, &id).await;

    Ok(Json(
        serde_json::json!({ "timeEntry": TimeEntryWithBreaks { entry, breaks } }),
    ))
}

async fn create_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateTimeEntryRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let id = crate::id::new_cuid();
    let name = body.name.unwrap_or_else(|| "Timer".to_string());
    let tags = body.tags.unwrap_or_default();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"INSERT INTO time_entries (id, name, description, status, started_at, last_resumed_at,
                                     total_duration, user_id, ticket_id, tags, billable, location,
                                     created_at, updated_at)
           VALUES ($1, $2, $3, 'RUNNING', $4, $4, 0, $5, $6, $7, $8, $9, $4, $4)"#,
    )
    .bind(&id)
    .bind(&name)
    .bind(&body.description)
    .bind(now)
    .bind(&user.id)
    .bind(&body.ticket_id)
    .bind(&tags)
    .bind(body.billable.unwrap_or(false))
    .bind(&body.location)
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

async fn add_manual_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<AddTimeEntryRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let id = crate::id::new_cuid();
    let total_secs =
        body.hours.unwrap_or(0) * 3600 + body.minutes.unwrap_or(0) * 60 + body.seconds.unwrap_or(0);

    let started_at = body
        .started_at
        .as_deref()
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
        .unwrap_or_else(|| Utc::now().naive_utc());
    let stopped_at = started_at + chrono::Duration::seconds(total_secs as i64);
    let tags = body.tags.unwrap_or_default();

    sqlx::query(
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
    .bind(&user.id)
    .bind(&tags)
    .bind(body.billable.unwrap_or(false))
    .bind(&body.location)
    .execute(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

async fn update_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateTimeEntryRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    check_owned(&state.pool, &id, &user.id).await?;

    if let Some(ref name) = body.name {
        sqlx::query("UPDATE time_entries SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref desc) = body.description {
        sqlx::query("UPDATE time_entries SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(desc).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref tags) = body.tags {
        sqlx::query("UPDATE time_entries SET tags = $1, updated_at = NOW() WHERE id = $2")
            .bind(tags).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref loc) = body.location {
        sqlx::query("UPDATE time_entries SET location = $1, updated_at = NOW() WHERE id = $2")
            .bind(loc).bind(&id).execute(&state.pool).await?;
    }
    if let Some(billable) = body.billable {
        sqlx::query("UPDATE time_entries SET billable = $1, updated_at = NOW() WHERE id = $2")
            .bind(billable).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            sqlx::query("UPDATE time_entries SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                .bind(&id).execute(&state.pool).await?;
        } else {
            sqlx::query("UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1")
                .bind(&id).execute(&state.pool).await?;
        }
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    check_owned(&state.pool, &id, &user.id).await?;
    sqlx::query("DELETE FROM time_entries WHERE id = $1")
        .bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn stop_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = fetch_owned(&state.pool, &id, &user.id).await?;
    if entry.status != "RUNNING" && entry.status != "PAUSED" {
        return Err(AppError::bad_request("Timer is not running or paused"));
    }
    let now = Utc::now().naive_utc();
    let additional = if entry.status == "RUNNING" {
        entry.last_resumed_at.map(|lr| (now - lr).num_seconds() as i32).unwrap_or(0)
    } else { 0 };
    sqlx::query(
        "UPDATE time_entries SET status = 'STOPPED', stopped_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    ).bind(now).bind(additional).bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn pause_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = fetch_owned(&state.pool, &id, &user.id).await?;
    if entry.status != "RUNNING" {
        return Err(AppError::bad_request("Timer is not running"));
    }
    let now = Utc::now().naive_utc();
    let additional = entry.last_resumed_at.map(|lr| (now - lr).num_seconds() as i32).unwrap_or(0);
    sqlx::query(
        "UPDATE time_entries SET status = 'PAUSED', paused_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    ).bind(now).bind(additional).bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn resume_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = fetch_owned(&state.pool, &id, &user.id).await?;
    if entry.status != "PAUSED" {
        return Err(AppError::bad_request("Timer is not paused"));
    }
    let now = Utc::now().naive_utc();
    sqlx::query(
        "UPDATE time_entries SET status = 'RUNNING', last_resumed_at = $1, paused_at = NULL, updated_at = NOW() WHERE id = $2",
    ).bind(now).bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn complete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let entry = fetch_owned(&state.pool, &id, &user.id).await?;
    if entry.status != "STOPPED" {
        return Err(AppError::bad_request("Timer must be stopped first"));
    }
    let now = Utc::now().naive_utc();
    sqlx::query(
        "UPDATE time_entries SET status = 'COMPLETED', completed_at = $1, updated_at = NOW() WHERE id = $2",
    ).bind(now).bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn add_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateBreakRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    check_owned(&state.pool, &id, &user.id).await?;
    let break_id = crate::id::new_cuid();
    let started_at = body.started_at.as_deref()
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok())
        .unwrap_or_else(|| Utc::now().naive_utc());
    let ended_at = body.ended_at.as_deref()
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok());
    let duration = ended_at.map(|e| (e - started_at).num_seconds() as i32).unwrap_or(0);

    sqlx::query(
        "INSERT INTO time_entry_breaks (id, time_entry_id, started_at, ended_at, duration, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(&break_id).bind(&id).bind(started_at).bind(ended_at).bind(duration).bind(&body.description)
    .execute(&state.pool).await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": break_id }))))
}

async fn delete_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, break_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    check_owned(&state.pool, &id, &user.id).await?;
    sqlx::query("DELETE FROM time_entry_breaks WHERE id = $1 AND time_entry_id = $2")
        .bind(&break_id).bind(&id).execute(&state.pool).await?;
    Ok(Json(serde_json::json!({ "success": true })))
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

async fn bulk_update_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkUpdateTimeEntriesRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let status = match body.status.as_deref() {
        Some("RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED") => body.status.unwrap(),
        _ => return Err(AppError::bad_request("Invalid or missing status")),
    };
    for id in &body.ids {
        if check_owned(&state.pool, id, &user.id).await.is_ok() {
            let _ = sqlx::query("UPDATE time_entries SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3")
                .bind(&status)
                .bind(id)
                .bind(&user.id)
                .execute(&state.pool)
                .await;
        }
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn bulk_archive_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    for id in &body.ids {
        if check_owned(&state.pool, id, &user.id).await.is_ok() {
            let _ = sqlx::query("UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(&user.id)
                .execute(&state.pool)
                .await;
        }
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn bulk_delete_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    for id in &body.ids {
        if check_owned(&state.pool, id, &user.id).await.is_ok() {
            let _ = sqlx::query("DELETE FROM time_entries WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(&user.id)
                .execute(&state.pool)
                .await;
        }
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn check_owned(pool: &sqlx::PgPool, id: &str, user_id: &str) -> Result<(), AppError> {
    let row = sqlx::query("SELECT user_id FROM time_entries WHERE id = $1")
        .bind(id).fetch_optional(pool).await?
        .ok_or_else(|| AppError::not_found("Time entry not found"))?;
    let owner: String = row.get("user_id");
    if owner != user_id { return Err(AppError::forbidden("Not your time entry")); }
    Ok(())
}

async fn fetch_owned(pool: &sqlx::PgPool, id: &str, user_id: &str) -> Result<TimeEntryRow, AppError> {
    let sql = format!("{ENTRY_SELECT} FROM time_entries WHERE id = $1 AND user_id = $2");
    let row = sqlx::query(&sql).bind(id).bind(user_id).fetch_optional(pool).await?
        .ok_or_else(|| AppError::not_found("Time entry not found"))?;
    Ok(row_to_entry(&row))
}
