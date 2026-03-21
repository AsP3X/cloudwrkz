use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use sqlx::{Postgres, Row};

use crate::auth::extractors::AuthUser;
use crate::command_queue::{
    apply_mutation_tx_settings, mutation_response, run_mutation_defer,
    JsonMutationResult, MutationRunContext,
};
use crate::error::AppError;
use crate::models::time_entry::*;
use crate::routes::helpers::{hash_json_for_idempotency, idempotency_key_from_headers};
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/time-tracking", get(list_entries).post(create_entry))
        .route("/time-tracking/tags", get(list_tag_suggestions))
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
            axum::routing::patch(update_break).delete(delete_break),
        )
}

#[derive(Debug, Deserialize)]
struct TagSuggestionParams {
    q: Option<String>,
}

async fn list_tag_suggestions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TagSuggestionParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let query = params.q.unwrap_or_default();
    let trimmed = query.trim();

    if trimmed.is_empty() {
        let rows = sqlx::query(
            r#"
            SELECT tag, COUNT(*)::INT AS usage_count
            FROM (
              SELECT unnest(tags) AS tag
              FROM time_entries
              WHERE user_id = $1 AND archived_at IS NULL
            ) t
            GROUP BY tag
            ORDER BY usage_count DESC, tag ASC
            LIMIT 5
            "#,
        )
        .bind(&user.id)
        .fetch_all(&state.pool)
        .await?;

        let tags: Vec<String> = rows.into_iter().map(|row| row.get("tag")).collect();
        return Ok(Json(serde_json::json!({ "tags": tags })));
    }

    let pattern = format!("%{}%", trimmed);

    let has_share_table: bool = sqlx::query_scalar(
        "SELECT EXISTS (
           SELECT 1
           FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'time_entry_shares'
         )",
    )
    .fetch_one(&state.pool)
    .await?;

    let rows = if has_share_table {
        sqlx::query(
            r#"
            SELECT DISTINCT tag
            FROM (
              SELECT unnest(te.tags) AS tag
              FROM time_entries te
              WHERE te.user_id = $1 AND te.archived_at IS NULL

              UNION

              SELECT unnest(te.tags) AS tag
              FROM time_entries te
              INNER JOIN time_entry_shares tes ON tes.time_entry_id = te.id
              WHERE tes.shared_with_user_id = $1 AND te.archived_at IS NULL
            ) tags
            WHERE tag ILIKE $2
            ORDER BY tag ASC
            LIMIT 50
            "#,
        )
        .bind(&user.id)
        .bind(&pattern)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query(
            r#"
            SELECT DISTINCT unnest(tags) AS tag
            FROM time_entries
            WHERE user_id = $1
              AND archived_at IS NULL
              AND EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag ILIKE $2)
            ORDER BY tag ASC
            LIMIT 50
            "#,
        )
        .bind(&user.id)
        .bind(&pattern)
        .fetch_all(&state.pool)
        .await?
    };

    let tags: Vec<String> = rows.into_iter().map(|row| row.get("tag")).collect();
    Ok(Json(serde_json::json!({ "tags": tags })))
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
    headers: HeaderMap,
    Json(body): Json<CreateTimeEntryRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("time:create:{uid}");
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
                .bind(&user_id)
                .bind(&body.ticket_id)
                .bind(&tags)
                .bind(body.billable.unwrap_or(false))
                .bind(&body.location)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::created(serde_json::json!({ "id": id })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

fn parse_iso_datetime_utc_naive(s: &str) -> Option<chrono::NaiveDateTime> {
    chrono::DateTime::parse_from_rfc3339(s.trim())
        .ok()
        .map(|dt| dt.naive_utc())
}

async fn add_manual_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<AddTimeEntryRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking/add".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("time:create:{uid}");
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
                let total_secs = body.hours.unwrap_or(0) * 3600
                    + body.minutes.unwrap_or(0) * 60
                    + body.seconds.unwrap_or(0);

                let started_at = body
                    .started_at
                    .as_deref()
                    .and_then(|s| {
                        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
                    })
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
                .bind(&user_id)
                .bind(&tags)
                .bind(body.billable.unwrap_or(false))
                .bind(&body.location)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::created(serde_json::json!({ "id": id })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn update_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateTimeEntryRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PATCH /time-tracking/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route,
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let b = body.clone();
    let shard = format!("time:{id}");
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
                let existing = fetch_owned_locked(&mut tx, &id, &user_id).await?;

                if let Some(ref name) = body.name {
                    sqlx::query("UPDATE time_entries SET name = $1, updated_at = NOW() WHERE id = $2")
                        .bind(name)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref desc) = body.description {
                    sqlx::query(
                        "UPDATE time_entries SET description = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(desc)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref tags) = body.tags {
                    sqlx::query("UPDATE time_entries SET tags = $1, updated_at = NOW() WHERE id = $2")
                        .bind(tags)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref loc) = body.location {
                    sqlx::query(
                        "UPDATE time_entries SET location = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(loc)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(billable) = body.billable {
                    sqlx::query(
                        "UPDATE time_entries SET billable = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(billable)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }

                match body.timezone.as_ref() {
                    Some(value) if value.is_null() => {
                        sqlx::query(
                            "UPDATE time_entries SET timezone = NULL, updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                    Some(value) => {
                        if let Some(tz_str) = value.as_str() {
                            sqlx::query(
                                "UPDATE time_entries SET timezone = $1, updated_at = NOW() WHERE id = $2",
                            )
                            .bind(tz_str)
                            .bind(&id)
                            .execute(&mut *tx)
                            .await?;
                        }
                    }
                    None => {}
                }

                let started_at_update = match body.started_at.as_deref() {
                    Some(raw) => Some(parse_iso_datetime_utc_naive(raw).ok_or_else(|| {
                        AppError::bad_request(
                            "Invalid started_at timestamp (expected ISO-8601 / RFC3339)",
                        )
                    })?),
                    None => None,
                };

                let stopped_at_update: Option<Option<chrono::NaiveDateTime>> =
                    match body.stopped_at.as_ref() {
                        None => None,
                        Some(value) if value.is_null() => Some(None),
                        Some(value) => {
                            let raw = value.as_str().ok_or_else(|| {
                                AppError::bad_request(
                                    "Invalid stopped_at value (expected ISO-8601 string or null)",
                                )
                            })?;
                            let parsed = parse_iso_datetime_utc_naive(raw).ok_or_else(|| {
                                AppError::bad_request(
                                    "Invalid stopped_at timestamp (expected ISO-8601 / RFC3339)",
                                )
                            })?;
                            Some(Some(parsed))
                        }
                    };

                if started_at_update.is_some() || stopped_at_update.is_some() {
                    let final_started = started_at_update.unwrap_or(existing.started_at);
                    let final_stopped = stopped_at_update.unwrap_or(existing.stopped_at);
                    let recalculated_duration = final_stopped
                        .map(|stop| (stop - final_started).num_seconds())
                        .unwrap_or(existing.total_duration as i64);

                    if recalculated_duration < 0 {
                        return Err(AppError::bad_request("End time must be after start time"));
                    }

                    sqlx::query(
            "UPDATE time_entries SET started_at = $1, stopped_at = $2, total_duration = $3, updated_at = NOW() WHERE id = $4",
        )
                    .bind(final_started)
                    .bind(final_stopped)
                    .bind(recalculated_duration as i32)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }

                if let Some(ref archived) = body.archived_at {
                    if archived.is_null() {
                        sqlx::query(
                            "UPDATE time_entries SET archived_at = NULL, updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    } else {
                        sqlx::query(
                            "UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                }

                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn delete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("DELETE /time-tracking/{id}"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
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
                lock_time_entry(&mut tx, &id, &user_id).await?;
                sqlx::query("DELETE FROM time_entries WHERE id = $1")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn stop_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("POST /time-tracking/{id}/stop"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
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
                let entry = fetch_owned_locked(&mut tx, &id, &user_id).await?;
                if entry.status != "RUNNING" && entry.status != "PAUSED" {
                    return Err(AppError::bad_request("Timer is not running or paused"));
                }
                let now = Utc::now().naive_utc();
                let additional = if entry.status == "RUNNING" {
                    entry
                        .last_resumed_at
                        .map(|lr| (now - lr).num_seconds() as i32)
                        .unwrap_or(0)
                } else {
                    0
                };
                sqlx::query(
        "UPDATE time_entries SET status = 'STOPPED', stopped_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    )
                .bind(now)
                .bind(additional)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn pause_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("POST /time-tracking/{id}/pause"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
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
                let entry = fetch_owned_locked(&mut tx, &id, &user_id).await?;
                if entry.status != "RUNNING" {
                    return Err(AppError::bad_request("Timer is not running"));
                }
                let now = Utc::now().naive_utc();
                let additional = entry
                    .last_resumed_at
                    .map(|lr| (now - lr).num_seconds() as i32)
                    .unwrap_or(0);
                sqlx::query(
        "UPDATE time_entries SET status = 'PAUSED', paused_at = $1, total_duration = total_duration + $2, last_resumed_at = NULL, updated_at = NOW() WHERE id = $3",
    )
                .bind(now)
                .bind(additional)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn resume_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("POST /time-tracking/{id}/resume"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
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
                let entry = fetch_owned_locked(&mut tx, &id, &user_id).await?;
                if entry.status != "PAUSED" {
                    return Err(AppError::bad_request("Timer is not paused"));
                }
                let now = Utc::now().naive_utc();
                sqlx::query(
        "UPDATE time_entries SET status = 'RUNNING', last_resumed_at = $1, paused_at = NULL, updated_at = NOW() WHERE id = $2",
    )
                .bind(now)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn complete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("POST /time-tracking/{id}/complete"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
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
                let entry = fetch_owned_locked(&mut tx, &id, &user_id).await?;
                if entry.status != "STOPPED" {
                    return Err(AppError::bad_request("Timer must be stopped first"));
                }
                let now = Utc::now().naive_utc();
                sqlx::query(
        "UPDATE time_entries SET status = 'COMPLETED', completed_at = $1, updated_at = NOW() WHERE id = $2",
    )
                .bind(now)
                .bind(&id)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn add_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<CreateBreakRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("POST /time-tracking/{id}/breaks"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
    let b = body.clone();
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
                lock_time_entry(&mut tx, &id, &user_id).await?;
                let break_id = crate::id::new_cuid();
                let started_at = body
                    .started_at
                    .as_deref()
                    .and_then(|s| {
                        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
                    })
                    .unwrap_or_else(|| Utc::now().naive_utc());
                let ended_at = body
                    .ended_at
                    .as_deref()
                    .and_then(|s| {
                        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.fZ").ok()
                    });
                let duration = ended_at
                    .map(|e| (e - started_at).num_seconds() as i32)
                    .unwrap_or(0);

                sqlx::query(
        "INSERT INTO time_entry_breaks (id, time_entry_id, started_at, ended_at, duration, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
                .bind(&break_id)
                .bind(&id)
                .bind(started_at)
                .bind(ended_at)
                .bind(duration)
                .bind(&body.description)
                .execute(&mut *tx)
                .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::created(serde_json::json!({ "id": break_id })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn update_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, break_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<UpdateBreakRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PATCH /time-tracking/{id}/breaks/{break_id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route,
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let id_clone = id.clone();
    let bid = break_id.clone();
    let uid = user.id.clone();
    let b = body.clone();
    let shard = format!("time:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let break_id = bid.clone();
        let user_id = uid.clone();
        let body = b.clone();
        move || {
            let id = id.clone();
            let break_id = break_id.clone();
            let user_id = user_id.clone();
            let body = body.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;
                lock_time_entry(&mut tx, &id, &user_id).await?;

                if let Some(ref raw) = body.started_at {
                    let parsed = parse_iso_datetime_utc_naive(raw).ok_or_else(|| {
                        AppError::bad_request("Invalid started_at timestamp")
                    })?;
                    sqlx::query(
                        "UPDATE time_entry_breaks SET started_at = $1, updated_at = NOW() WHERE id = $2 AND time_entry_id = $3",
                    )
                    .bind(parsed)
                    .bind(&break_id)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }

                match body.ended_at.as_ref() {
                    Some(value) if value.is_null() => {
                        sqlx::query(
                            "UPDATE time_entry_breaks SET ended_at = NULL, duration = 0, updated_at = NOW() WHERE id = $1 AND time_entry_id = $2",
                        )
                        .bind(&break_id)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                    Some(value) => {
                        let raw = value.as_str().ok_or_else(|| {
                            AppError::bad_request("Invalid ended_at value")
                        })?;
                        let parsed = parse_iso_datetime_utc_naive(raw).ok_or_else(|| {
                            AppError::bad_request("Invalid ended_at timestamp")
                        })?;
                        let row = sqlx::query(
                            "SELECT started_at FROM time_entry_breaks WHERE id = $1 AND time_entry_id = $2",
                        )
                        .bind(&break_id)
                        .bind(&id)
                        .fetch_one(&mut *tx)
                        .await?;
                        let started: chrono::NaiveDateTime = row.get("started_at");
                        let dur = (parsed - started).num_seconds() as i32;
                        sqlx::query(
                            "UPDATE time_entry_breaks SET ended_at = $1, duration = $2, updated_at = NOW() WHERE id = $3 AND time_entry_id = $4",
                        )
                        .bind(parsed)
                        .bind(dur)
                        .bind(&break_id)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                    None => {}
                }

                if let Some(ref desc) = body.description {
                    sqlx::query(
                        "UPDATE time_entry_breaks SET description = $1, updated_at = NOW() WHERE id = $2 AND time_entry_id = $3",
                    )
                    .bind(desc)
                    .bind(&break_id)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }

                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn delete_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, break_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("DELETE /time-tracking/{id}/breaks/{break_id}"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let bid = break_id.clone();
    let uid = user.id.clone();
    let shard = format!("time:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let break_id = bid.clone();
        let user_id = uid.clone();
        move || {
            let id = id.clone();
            let break_id = break_id.clone();
            let user_id = user_id.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;
                lock_time_entry(&mut tx, &id, &user_id).await?;
                sqlx::query("DELETE FROM time_entry_breaks WHERE id = $1 AND time_entry_id = $2")
                    .bind(&break_id)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
struct BulkUpdateTimeEntriesRequest {
    ids: Vec<String>,
    status: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
struct BulkIdsRequest {
    ids: Vec<String>,
}

async fn bulk_update_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<BulkUpdateTimeEntriesRequest>,
) -> Result<Response, AppError> {
    let status = match body.status.as_deref() {
        Some("RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED") => body.status.clone().unwrap(),
        _ => return Err(AppError::bad_request("Invalid or missing status")),
    };
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking/bulk-update".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("time:bulk:{uid}");
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let user_id = uid.clone();
        let sorted_ids = sorted_ids.clone();
        let status = status.clone();
        move || {
            let user_id = user_id.clone();
            let sorted_ids = sorted_ids.clone();
            let status = status.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;
                for id in sorted_ids {
                    if lock_time_entry(&mut tx, &id, &user_id).await.is_ok() {
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
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn bulk_archive_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking/bulk-archive".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("time:bulk:{uid}");
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let user_id = uid.clone();
        let sorted_ids = sorted_ids.clone();
        move || {
            let user_id = user_id.clone();
            let sorted_ids = sorted_ids.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;
                for id in sorted_ids {
                    if lock_time_entry(&mut tx, &id, &user_id).await.is_ok() {
                        let _ = sqlx::query(
                            "UPDATE time_entries SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2",
                        )
                        .bind(&id)
                        .bind(&user_id)
                        .execute(&mut *tx)
                        .await;
                    }
                }
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn bulk_delete_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking/bulk-delete".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("time:bulk:{uid}");
    let mut sorted_ids = body.ids.clone();
    sorted_ids.sort();
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let user_id = uid.clone();
        let sorted_ids = sorted_ids.clone();
        move || {
            let user_id = user_id.clone();
            let sorted_ids = sorted_ids.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;
                for id in sorted_ids {
                    if lock_time_entry(&mut tx, &id, &user_id).await.is_ok() {
                        let _ = sqlx::query("DELETE FROM time_entries WHERE id = $1 AND user_id = $2")
                            .bind(&id)
                            .bind(&user_id)
                            .execute(&mut *tx)
                            .await;
                    }
                }
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({ "success": true })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn lock_time_entry(
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

async fn fetch_owned_locked(
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
