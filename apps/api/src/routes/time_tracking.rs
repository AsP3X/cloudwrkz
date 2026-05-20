//! Time entry CRUD, timers, breaks, tag suggestions, and bulk maintenance endpoints.

// Human: Timer flows split across many POST subroutes (`stop`, `pause`, `resume`, `complete`) so mobile clients hit explicit state transitions instead of ambiguous PATCH bodies.
// Agent: router /time-tracking* many routes; entity_creates time entry job types; run_mutation_defer on bulk + write operations.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::command_queue::{MutationQueuedResponse, MutationRunContext};
use crate::error::AppError;
use crate::job_queue::entity_creates;
use crate::models::time_entry::*;
use crate::routes::AppState;
use crate::routes::helpers::{hash_json_for_idempotency, idempotency_key_from_headers};

// Human: Bulk routes are first-class POST endpoints so large batch operations can share one idempotency key and mutation deferral policy.
// Agent: Router includes /time-tracking/bulk-update bulk-archive bulk-delete plus per-entry break subroutes.

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
            get(get_entry).patch(update_entry).delete(delete_entry),
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
       customer_id, customer_contact_id, hourly_rate::float8 as hourly_rate,
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
        customer_id: r.get("customer_id"),
        customer_contact_id: r.get("customer_contact_id"),
        hourly_rate: r.get("hourly_rate"),
        tags: r.get("tags"),
        billable: r.get("billable"),
        location: r.get("location"),
        timezone: r.get("timezone"),
        archived_at: r.get("archived_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }
}

// Human: List/detail responses embed an optional customer summary when a timer is linked for billing context.
// Agent: entry_to_json READS TimeEntryRow+breaks; MAY CALL customer_summary_json; EMITS flat entry fields + breaks array.
async fn entry_to_json(
    pool: &sqlx::PgPool,
    entry: TimeEntryRow,
    breaks: Vec<TimeEntryBreakRow>,
) -> serde_json::Value {
    let customer = match entry.customer_id.as_deref() {
        Some(cid) => crate::time_entry_billing::customer_summary_json(pool, cid)
            .await
            .ok(),
        None => None,
    };
    let mut val = serde_json::to_value(TimeEntryWithBreaks { entry, breaks })
        .map_err(|e| AppError::internal(format!("serialize time entry: {e}")))
        .unwrap_or_else(|_| serde_json::json!({}));
    if let Some(c) = customer {
        val["customer"] = c;
    }
    val
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
        result.push(entry_to_json(&state.pool, entry, breaks).await);
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
        result.push(entry_to_json(&state.pool, entry, breaks).await);
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
        serde_json::json!({ "timeEntry": entry_to_json(&state.pool, entry, breaks).await }),
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
        .map_err(|e| AppError::internal(format!("serialize time entry create: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_TIMER,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Time entry creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_TIMER.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
        .map_err(|e| AppError::internal(format!("serialize manual time entry: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_MANUAL,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Manual time entry creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_CREATE_MANUAL.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
        .map_err(|e| AppError::internal(format!("serialize time entry update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Time entry update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("DELETE /time-tracking/{id}");
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
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Time entry deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn stop_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("POST /time-tracking/{id}/stop");
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
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_STOP,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Stop timer is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_STOP.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn pause_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("POST /time-tracking/{id}/pause");
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
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_PAUSE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Pause timer is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_PAUSE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn resume_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("POST /time-tracking/{id}/resume");
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
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_RESUME,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Resume timer is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_RESUME.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn complete_entry(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("POST /time-tracking/{id}/complete");
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
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_COMPLETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Complete timer is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_COMPLETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn add_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<CreateBreakRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("POST /time-tracking/{id}/breaks");
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
        .map_err(|e| AppError::internal(format!("serialize break create: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "time_entry_id": id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_CREATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Break creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
        .map_err(|e| AppError::internal(format!("serialize break update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "time_entry_id": id,
        "break_id": break_id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Break update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_break(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, break_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let route = format!("DELETE /time-tracking/{id}/breaks/{break_id}");
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
        "time_entry_id": id,
        "break_id": break_id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Break deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BREAK_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
    match body.status.as_deref() {
        Some("RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED") => {}
        _ => return Err(AppError::bad_request("Invalid or missing status")),
    };
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /time-tracking/bulk-update".into(),
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
        .map_err(|e| AppError::internal(format!("serialize bulk update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Bulk time entry update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BULK_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
        .map_err(|e| AppError::internal(format!("serialize bulk archive: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Bulk time entry archive is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BULK_ARCHIVE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
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
        .map_err(|e| AppError::internal(format!("serialize bulk delete: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_TIME_ENTRY_BULK_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Bulk time entry delete is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_TIME_ENTRY_BULK_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}
