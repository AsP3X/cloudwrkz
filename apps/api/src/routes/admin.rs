use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;

use crate::audit::{self, WriteAuditParams};
use crate::auth::extractors::AuthUser;
use crate::auth::password;
use crate::diagnostics_token;
use crate::error::AppError;
use crate::models::audit_log::AuditLogRow;
use crate::models::notification::NotificationRow;
use crate::routes::helpers::{check_permission, get_user_permission_keys};
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/audit/entries", get(audit_entries))
        .route("/admin/audit/actions", get(audit_actions))
        .route("/admin/audit/export", get(audit_export))
        .route("/admin/audit/events", get(audit_events))
        .route("/admin/db-query", post(db_query))
        .route("/admin/db-tables", get(db_tables))
        .route("/admin/db-row", post(db_row_update).delete(db_row_delete))
        .route("/admin/purge-deleted-accounts", post(purge_deleted))
        .route("/admin/users", get(list_users))
        .route(
            "/admin/users/{id}",
            get(get_user).patch(update_user).delete(delete_user),
        )
        .route(
            "/admin/users/{id}/effective-permissions",
            get(get_user_effective_permissions),
        )
        .route("/admin/users/{id}/ban", post(ban_user))
        .route("/admin/users/{id}/unban", post(unban_user))
        .route(
            "/admin/users/{id}/permissions",
            get(list_user_permissions).post(grant_user_permission),
        )
        .route(
            "/admin/users/{id}/permissions/{key}",
            axum::routing::delete(revoke_user_permission),
        )
        .route("/admin/permissions", get(list_permissions))
        .route("/admin/groups", get(list_groups).post(create_group))
        .route(
            "/admin/groups/{id}",
            get(get_group).patch(update_group).delete(delete_group),
        )
        .route(
            "/admin/groups/{id}/permissions",
            get(list_group_permissions).post(grant_group_permission),
        )
        .route(
            "/admin/groups/{id}/permissions/{key}",
            axum::routing::delete(revoke_group_permission),
        )
        .route("/admin/modules", get(list_modules))
        .route("/admin/modules/{id}", patch(toggle_module))
        .route("/admin/sessions", get(list_sessions))
        .route("/admin/sessions/{id}", axum::routing::delete(revoke_session))
        .route("/admin/statistics/analytics", get(admin_statistics_analytics))
        .route("/admin/statistics", get(admin_statistics))
        .route("/admin/dashboard-stats", get(admin_dashboard_stats))
        .route("/admin/settings", get(admin_settings))
        .route("/admin/settings/links-page-size", axum::routing::patch(update_links_page_size))
        .route("/admin/settings/qr-login-rate-limit", axum::routing::patch(update_qr_login_rate_limit))
        .route(
            "/admin/settings/diagnostics-health-token",
            post(rotate_diagnostics_health_token),
        )
        .route("/notifications", get(list_notifications))
        .route("/notifications/{id}/read", post(mark_notification_read))
}

const MAX_AUDIT_PAGE_LIMIT: i64 = 200;
const AUDIT_EXPORT_LIMIT: i64 = 10_000;

#[derive(Deserialize)]
struct AuditEntriesQuery {
    page: Option<u32>,
    limit: Option<u32>,
    action: Option<String>,
    user_id: Option<String>,
    resource_type: Option<String>,
    resource_id: Option<String>,
    from: Option<String>,
    to: Option<String>,
    user_search: Option<String>,
    sort_order: Option<String>,
}

async fn audit_entries(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<AuditEntriesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let page = q.page.unwrap_or(1).max(1);
    let limit = q
        .limit
        .unwrap_or(50)
        .min(MAX_AUDIT_PAGE_LIMIT as u32)
        .max(1);
    let skip: i64 = (page - 1) as i64 * limit as i64;
    let sort_desc = q.sort_order.as_deref() != Some("asc");

    let user_search = q.user_search.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(format!("%{t}%"))
        }
    });

    // Build dynamic filters. Use a single query with LEFT JOIN users for user_search.
    let total: i64 = if user_search.is_some() {
        let count: (i64,) = sqlx::query_as(
            r#"SELECT COUNT(*) FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
                 AND ($7::text IS NULL OR u.email ILIKE $7 OR u.name ILIKE $7)"#,
        )
        .bind(&q.action)
        .bind(&q.user_id)
        .bind(&q.resource_type)
        .bind(&q.resource_id)
        .bind(&q.from)
        .bind(&q.to)
        .bind(&user_search)
        .fetch_one(&state.pool)
        .await?;
        count.0
    } else {
        let count: (i64,) = sqlx::query_as(
            r#"SELECT COUNT(*) FROM audit_logs a
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)"#,
        )
        .bind(&q.action)
        .bind(&q.user_id)
        .bind(&q.resource_type)
        .bind(&q.resource_id)
        .bind(&q.from)
        .bind(&q.to)
        .fetch_one(&state.pool)
        .await?;
        count.0
    };

    let (list_sql_with_search, list_sql_no_search) = if sort_desc {
        (
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
                 AND ($7::text IS NULL OR u.email ILIKE $7 OR u.name ILIKE $7)
               ORDER BY a.created_at DESC LIMIT $8 OFFSET $9"#,
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
               ORDER BY a.created_at DESC LIMIT $7 OFFSET $8"#,
        )
    } else {
        (
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
                 AND ($7::text IS NULL OR u.email ILIKE $7 OR u.name ILIKE $7)
               ORDER BY a.created_at ASC LIMIT $8 OFFSET $9"#,
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
               ORDER BY a.created_at ASC LIMIT $7 OFFSET $8"#,
        )
    };

    let rows = if user_search.is_some() {
        sqlx::query(list_sql_with_search)
            .bind(&q.action)
            .bind(&q.user_id)
            .bind(&q.resource_type)
            .bind(&q.resource_id)
            .bind(&q.from)
            .bind(&q.to)
            .bind(&user_search)
            .bind(limit as i64)
            .bind(skip)
            .fetch_all(&state.pool)
            .await?
    } else {
        sqlx::query(list_sql_no_search)
            .bind(&q.action)
            .bind(&q.user_id)
            .bind(&q.resource_type)
            .bind(&q.resource_id)
            .bind(&q.from)
            .bind(&q.to)
            .bind(limit as i64)
            .bind(skip)
            .fetch_all(&state.pool)
            .await?
    };

    let entries: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let created_at: chrono::NaiveDateTime = r.get("created_at");
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "user_id": r.get::<Option<String>, _>("user_id"),
                "action": r.get::<String, _>("action"),
                "resource_type": r.get::<Option<String>, _>("resource_type"),
                "resource_id": r.get::<Option<String>, _>("resource_id"),
                "context": r.get::<Option<serde_json::Value>, _>("context"),
                "ip_address": r.get::<Option<String>, _>("ip_address"),
                "user_agent": r.get::<Option<String>, _>("user_agent"),
                "created_at": created_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                "user": match (r.get::<Option<String>, _>("user_email"), r.get::<Option<String>, _>("user_name")) {
                    (Some(email), name) => serde_json::json!({ "email": email, "name": name }),
                    (None, _) => serde_json::Value::Null,
                },
            })
        })
        .collect();

    let total_pages = (total + limit as i64 - 1) / limit as i64;
    let total_pages = total_pages.max(1);

    Ok(Json(serde_json::json!({
        "entries": entries,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    })))
}

async fn audit_actions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    let rows: Vec<(String,)> = sqlx::query_as("SELECT DISTINCT action FROM audit_logs ORDER BY action")
        .fetch_all(&state.pool)
        .await?;
    let actions: Vec<String> = rows.into_iter().map(|r| r.0).collect();
    Ok(Json(serde_json::json!({ "actions": actions })))
}

#[derive(Deserialize)]
struct AuditExportQuery {
    format: Option<String>,
    action: Option<String>,
    user_id: Option<String>,
    user_search: Option<String>,
    resource_type: Option<String>,
    resource_id: Option<String>,
    from: Option<String>,
    to: Option<String>,
}

async fn audit_export(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<AuditExportQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.export").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let format = q.format.as_deref().unwrap_or("json");
    if format != "json" && format != "csv" {
        return Err(AppError::bad_request("format must be json or csv"));
    }

    let user_search = q.user_search.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(format!("%{t}%"))
        }
    });

    let rows = if user_search.is_some() {
        sqlx::query(
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
                 AND ($7::text IS NULL OR u.email ILIKE $7 OR u.name ILIKE $7)
               ORDER BY a.created_at DESC LIMIT $8"#,
        )
        .bind(&q.action)
        .bind(&q.user_id)
        .bind(&q.resource_type)
        .bind(&q.resource_id)
        .bind(&q.from)
        .bind(&q.to)
        .bind(&user_search)
        .bind(AUDIT_EXPORT_LIMIT)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query(
            r#"SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                      a.context, a.ip_address, a.user_agent, a.created_at,
                      u.email as user_email, u.name as user_name
               FROM audit_logs a
               LEFT JOIN users u ON a.user_id = u.id
               WHERE ($1::text IS NULL OR a.action = $1)
                 AND ($2::text IS NULL OR a.user_id = $2)
                 AND ($3::text IS NULL OR a.resource_type = $3)
                 AND ($4::text IS NULL OR a.resource_id = $4)
                 AND ($5::text IS NULL OR a.created_at >= ($5::text || 'T00:00:00')::timestamp)
                 AND ($6::text IS NULL OR a.created_at <= ($6::text || 'T23:59:59.999')::timestamp)
               ORDER BY a.created_at DESC LIMIT $7"#,
        )
        .bind(&q.action)
        .bind(&q.user_id)
        .bind(&q.resource_type)
        .bind(&q.resource_id)
        .bind(&q.from)
        .bind(&q.to)
        .bind(AUDIT_EXPORT_LIMIT)
        .fetch_all(&state.pool)
        .await?
    };

    let entries: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let created_at: chrono::NaiveDateTime = r.get("created_at");
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "user_id": r.get::<Option<String>, _>("user_id"),
                "action": r.get::<String, _>("action"),
                "resource_type": r.get::<Option<String>, _>("resource_type"),
                "resource_id": r.get::<Option<String>, _>("resource_id"),
                "context": r.get::<Option<serde_json::Value>, _>("context"),
                "ip_address": r.get::<Option<String>, _>("ip_address"),
                "user_agent": r.get::<Option<String>, _>("user_agent"),
                "created_at": created_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                "user": match (r.get::<Option<String>, _>("user_email"), r.get::<Option<String>, _>("user_name")) {
                    (Some(email), name) => serde_json::json!({ "email": email, "name": name }),
                    (None, _) => serde_json::Value::Null,
                },
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "format": format,
        "entries": entries,
        "filename": format!("audit-log-{}", chrono::Utc::now().format("%Y-%m-%d")),
    })))
}

async fn audit_events(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let rows: Vec<AuditLogRow> = sqlx::query_as(
        r#"SELECT id, user_id, action, resource_type, resource_id,
                  context, ip_address, user_agent, created_at
           FROM audit_logs ORDER BY created_at DESC LIMIT 200"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let events: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "user_id": r.user_id,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "context": r.context,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "created_at": r.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "events": events })))
}

#[derive(Deserialize)]
struct DbQueryRequest {
    query: String,
}

async fn db_query(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<DbQueryRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "admin.db.view_entries").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let query = body.query.trim();
    if !query.to_uppercase().starts_with("SELECT") {
        return Err(AppError::bad_request("Only SELECT queries are allowed"));
    }

    let rows: Vec<serde_json::Value> = sqlx::query_scalar(&format!(
        "SELECT row_to_json(t) FROM ({query}) t LIMIT 1000"
    ))
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "rows": rows })))
}

async fn db_tables(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "admin.db.view").await
        && !check_permission(&state.pool, &user.id, "admin.db.view_entries").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let table_names: Vec<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "tables": table_names })))
}

fn sanitize_identifier(value: &str) -> Result<String, AppError> {
    if !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(AppError::bad_request("Invalid identifier"));
    }
    Ok(value.to_string())
}

fn format_sql_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        serde_json::Value::String(s) => {
            let escaped = s.replace('\'', "''");
            format!("'{escaped}'")
        }
        _ => {
            let escaped = value.to_string().replace('\'', "''");
            format!("'{escaped}'")
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbRowUpdateRequest {
    table: String,
    id_column: Option<String>,
    id_value: serde_json::Value,
    data: serde_json::Value,
}

async fn db_row_update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<DbRowUpdateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "admin.db.edit_entries").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let table = sanitize_identifier(body.table.trim())?;
    let id_column = body
        .id_column
        .as_deref()
        .unwrap_or("id")
        .trim();
    let id_column = sanitize_identifier(id_column)?;
    let data = match &body.data {
        serde_json::Value::Object(m) if !m.is_empty() => m,
        _ => return Err(AppError::bad_request("data object with at least one field is required")),
    };

    let mut set_clauses = Vec::with_capacity(data.len());
    for (key, value) in data {
        if key.as_str() == id_column.as_str() {
            continue;
        }
        let col = sanitize_identifier(key)?;
        set_clauses.push(format!(r#""{col}" = {}"#, format_sql_value(value)));
    }

    if set_clauses.is_empty() {
        return Err(AppError::bad_request("No updatable fields provided"));
    }

    let where_value = format_sql_value(&body.id_value);
    let query = format!(
        r#"UPDATE "public"."{table}" SET {} WHERE "{id_column}" = {where_value}"#,
        set_clauses.join(", ")
    );

    let result = sqlx::query(&query).execute(&state.pool).await?;
    let updated_count = result.rows_affected();

    Ok(Json(serde_json::json!({
        "success": true,
        "updatedCount": updated_count
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbRowDeleteRequest {
    table: String,
    id_column: Option<String>,
    id_value: serde_json::Value,
}

async fn db_row_delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<DbRowDeleteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "admin.db.delete_entries").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let table = sanitize_identifier(body.table.trim())?;
    let id_column = body
        .id_column
        .as_deref()
        .unwrap_or("id")
        .trim();
    let id_column = sanitize_identifier(id_column)?;
    let where_value = format_sql_value(&body.id_value);
    let query = format!(
        r#"DELETE FROM "public"."{table}" WHERE "{id_column}" = {where_value}"#
    );

    let result = sqlx::query(&query).execute(&state.pool).await?;
    let deleted_count = result.rows_affected();

    Ok(Json(serde_json::json!({
        "success": true,
        "deletedCount": deleted_count
    })))
}

async fn purge_deleted(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_settings(&state.pool, &user.id).await?;

    let cutoff = chrono::Utc::now().naive_utc() - chrono::Duration::days(30);
    let deleted_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM users WHERE status = 'DELETED' AND scheduled_for_deletion_at IS NOT NULL AND scheduled_for_deletion_at < $1",
    )
    .bind(cutoff)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();
    let deleted_count = deleted_ids.len() as i64;
    if deleted_count > 0 {
        sqlx::query("DELETE FROM sessions WHERE user_id = ANY($1)")
            .bind(&deleted_ids)
            .execute(&state.pool)
            .await?;
        sqlx::query("DELETE FROM users WHERE id = ANY($1)")
            .bind(&deleted_ids)
            .execute(&state.pool)
            .await?;
    }

    let purged = deleted_count;
    Ok(Json(serde_json::json!({
        "purged": purged,
        "deletedCount": purged,
        "message": if purged > 0 {
            format!("Successfully purged {} deleted account(s)", purged)
        } else {
            "No accounts to purge".to_string()
        }
    })))
}

async fn require_admin_settings(pool: &sqlx::PgPool, user_id: &str) -> Result<(), AppError> {
    if !check_permission(pool, user_id, "admin.settings.manage").await {
        return Err(AppError::forbidden("admin.settings.manage required"));
    }
    Ok(())
}

async fn admin_settings(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_settings(&state.pool, &user.id).await?;

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let total_tickets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let total_groups: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM groups")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let total_modules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM modules")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let enabled_modules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM modules WHERE enabled = true")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let active_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let db_users: i64 = total_users;
    let db_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let db_tickets: i64 = total_tickets;
    let ticket_comments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ticket_comments")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let db_groups: i64 = total_groups;
    let group_memberships: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM group_memberships")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let db_modules: i64 = total_modules;

    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();
    let sessions_ok = true;
    let modules_ok = total_modules > 0;
    let health_status = if db_ok && sessions_ok && modules_ok {
        "healthy"
    } else if !db_ok {
        "unhealthy"
    } else {
        "degraded"
    };
    let health_message = if health_status == "healthy" {
        "All systems operational"
    } else if health_status == "unhealthy" {
        "System health check failed"
    } else {
        "Some systems may be experiencing issues"
    };

    let links_default_page_size: i64 = sqlx::query_scalar(
        r#"SELECT COALESCE((config->>'defaultPageSize')::int, 50) FROM modules WHERE key = 'links' LIMIT 1"#,
    )
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(50);
    let valid_page_sizes = [10_i64, 25, 50, 100, 10000];
    let links_default_page_size = if valid_page_sizes.contains(&links_default_page_size) {
        links_default_page_size
    } else {
        50
    };

    let qr_requests_per_minute: i64 = sqlx::query_scalar(
        r#"SELECT (value#>>'{}')::int FROM system_settings WHERE key = 'qr_login_requests_per_minute' LIMIT 1"#,
    )
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(20);
    let qr_requests_per_minute = qr_requests_per_minute.clamp(1, 120);

    let env_diag = state.config.diagnostics_health_token.is_some();
    let db_diag = diagnostics_token::has_database_token(&state.pool).await;
    let diag_source = match (env_diag, db_diag) {
        (true, true) => "both",
        (true, false) => "environment",
        (false, true) => "database",
        (false, false) => "none",
    };

    Ok(Json(serde_json::json!({
        "systemInfo": {
            "totalUsers": total_users,
            "totalTickets": total_tickets,
            "totalGroups": total_groups,
            "totalModules": total_modules,
            "enabledModules": enabled_modules,
            "activeSessions": active_sessions,
        },
        "databaseStats": {
            "users": db_users,
            "sessions": db_sessions,
            "tickets": db_tickets,
            "ticketComments": ticket_comments,
            "groups": db_groups,
            "groupMemberships": group_memberships,
            "modules": db_modules,
        },
        "health": {
            "status": health_status,
            "checks": { "database": db_ok, "sessions": sessions_ok, "modules": modules_ok },
            "message": health_message,
        },
        "linksDefaultPageSize": links_default_page_size,
        "qrLoginRequestsPerMinute": qr_requests_per_minute,
        "diagnosticsHealthToken": {
            "configured": env_diag || db_diag,
            "source": diag_source,
        },
    })))
}

#[derive(Deserialize)]
struct LinksPageSizeBody {
    value: i64,
}

async fn update_links_page_size(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<LinksPageSizeBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_settings(&state.pool, &user.id).await?;
    const VALID: [i64; 5] = [10, 25, 50, 100, 10000];
    if !VALID.contains(&body.value) {
        return Err(AppError::bad_request("Invalid page size"));
    }
    let config_value = serde_json::json!({ "defaultPageSize": body.value });
    sqlx::query(
        r#"UPDATE modules SET config = COALESCE(config, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE key = 'links'"#,
    )
    .bind(config_value.to_string())
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
struct QrRateLimitBody {
    value: i64,
}

async fn update_qr_login_rate_limit(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<QrRateLimitBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_settings(&state.pool, &user.id).await?;
    let v = body.value.clamp(1, 120);
    let value_json = serde_json::json!(v);
    sqlx::query(
        r#"INSERT INTO system_settings (key, value, updated_at) VALUES ('qr_login_requests_per_minute', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
    )
    .bind(&value_json)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn rotate_diagnostics_health_token(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin_settings(&state.pool, &user.id).await?;

    let raw = diagnostics_token::generate_raw_token();
    let hash = password::hash_password(&raw).map_err(|e| {
        AppError::internal(format!("Could not hash diagnostics token: {e}"))
    })?;
    diagnostics_token::set_stored_hash(&state.pool, &hash)
        .await
        .map_err(|e| AppError::internal(format!("Could not store diagnostics token: {e}")))?;

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.settings.diagnostics_health_token.rotate".into(),
            resource_type: Some("system_settings".into()),
            resource_id: Some("diagnostics_health_token_hash".into()),
            context: None,
            ip_address: audit::client_ip_from_headers(&headers),
            user_agent: headers
                .get(axum::http::header::USER_AGENT)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
        },
    );

    Ok(Json(serde_json::json!({
        "token": raw,
        "message": "Store this token securely. It is shown only once. Use Authorization: Bearer <token> with GET /api/v1/health/detailed. A token set via DIAGNOSTICS_HEALTH_TOKEN is unchanged."
    })))
}

#[derive(Deserialize)]
struct UserListParams {
    search: Option<String>,
    status: Option<String>,
    role: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<UserListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);
    let search = params.search.unwrap_or_default();
    let pattern = format!("%{search}%");

    let rows = sqlx::query(
        r#"SELECT u.id, u.email, u.name, u.role::text as role, u.status::text as status,
                  u.email_verified, u.avatar, u.timezone, u.theme, u.locale, u.bio,
                  u.last_login_at, u.created_at, u.updated_at,
                  (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) as permission_count
           FROM users u
           WHERE ($1::text = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
             AND ($3::text IS NULL OR u.status::text = $3)
             AND ($4::text IS NULL OR u.role::text = $4)
           ORDER BY u.created_at DESC
           LIMIT $5 OFFSET $6"#,
    )
    .bind(&search)
    .bind(&pattern)
    .bind(&params.status)
    .bind(&params.role)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM users
           WHERE ($1::text = '' OR name ILIKE $2 OR email ILIKE $2)
             AND ($3::text IS NULL OR status::text = $3)
             AND ($4::text IS NULL OR role::text = $4)"#,
    )
    .bind(&search)
    .bind(&pattern)
    .bind(&params.status)
    .bind(&params.role)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let users: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "email": r.get::<String, _>("email"),
                "name": r.get::<Option<String>, _>("name"),
                "role": r.get::<String, _>("role"),
                "status": r.get::<String, _>("status"),
                "emailVerified": r.get::<bool, _>("email_verified"),
                "avatar": r.get::<Option<String>, _>("avatar"),
                "timezone": r.get::<Option<String>, _>("timezone"),
                "theme": r.get::<Option<String>, _>("theme"),
                "locale": r.get::<Option<String>, _>("locale"),
                "bio": r.get::<Option<String>, _>("bio"),
                "lastLoginAt": r.get::<Option<chrono::NaiveDateTime>, _>("last_login_at"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
                "permissionCount": r.get::<i64, _>("permission_count"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "users": users, "total": total })))
}

async fn get_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }

    let r = sqlx::query(
        r#"SELECT id, email, name, role::text as role, status::text as status,
                  email_verified, avatar, timezone, theme, locale, bio,
                  last_login_at, banned_at, ban_reason, created_at, updated_at
           FROM users WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::not_found("User not found"))?;

    let created_tickets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets WHERE created_by_id = $1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let assigned_tickets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets WHERE assigned_to_id = $1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let ticket_comments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ticket_comments WHERE user_id = $1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let group_memberships_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM group_memberships WHERE user_id = $1")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let group_rows = sqlx::query(
        r#"SELECT gm.id as membership_id, g.id, g.name, g.description FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id WHERE gm.user_id = $1 ORDER BY g.name"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let group_memberships: Vec<serde_json::Value> = group_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("membership_id"),
                "group": {
                    "id": row.get::<String, _>("id"),
                    "name": row.get::<String, _>("name"),
                    "description": row.get::<Option<String>, _>("description"),
                },
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "user": {
            "id": r.get::<String, _>("id"),
            "email": r.get::<String, _>("email"),
            "name": r.get::<Option<String>, _>("name"),
            "role": r.get::<String, _>("role"),
            "status": r.get::<String, _>("status"),
            "emailVerified": r.get::<bool, _>("email_verified"),
            "avatar": r.get::<Option<String>, _>("avatar"),
            "timezone": r.get::<Option<String>, _>("timezone"),
            "theme": r.get::<Option<String>, _>("theme"),
            "locale": r.get::<Option<String>, _>("locale"),
            "bio": r.get::<Option<String>, _>("bio"),
            "lastLoginAt": r.get::<Option<chrono::NaiveDateTime>, _>("last_login_at"),
            "bannedAt": r.get::<Option<chrono::NaiveDateTime>, _>("banned_at"),
            "banReason": r.get::<Option<String>, _>("ban_reason"),
            "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
            "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            "_count": {
                "createdTickets": created_tickets,
                "assignedTickets": assigned_tickets,
                "ticketComments": ticket_comments,
                "groupMemberships": group_memberships_count,
            },
            "groupMemberships": group_memberships,
        }
    })))
}

async fn get_user_effective_permissions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }
    let keys = get_user_permission_keys(&state.pool, &id).await;
    Ok(Json(serde_json::json!({ "permissions": keys })))
}

#[derive(Deserialize)]
struct BanUserRequest {
    reason: String,
}

async fn ban_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<BanUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }
    sqlx::query(
        r#"UPDATE users SET status = 'BANNED', banned_at = NOW(), ban_reason = $1, updated_at = NOW() WHERE id = $2"#,
    )
    .bind(body.reason.trim())
    .bind(&id)
    .execute(&state.pool)
    .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.users.ban".into(),
            resource_type: Some("user".into()),
            resource_id: Some(id.clone()),
            context: Some(serde_json::json!({ "reason": body.reason.trim() })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
struct UnbanUserRequest {
    reason: Option<String>,
}

async fn unban_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UnbanUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }
    sqlx::query(
        r#"UPDATE users SET status = 'ACTIVE', banned_at = NULL, ban_reason = NULL, updated_at = NOW() WHERE id = $1"#,
    )
    .bind(&id)
    .execute(&state.pool)
    .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.users.unban".into(),
            resource_type: Some("user".into()),
            resource_id: Some(id),
            context: body.reason.as_ref().map(|r| serde_json::json!({ "reason": r })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
struct UpdateUserRequest {
    name: Option<String>,
    role: Option<String>,
    status: Option<String>,
}

async fn update_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    if let Some(ref role) = body.role {
        sqlx::query("UPDATE users SET role = $1::\"UserRole\", updated_at = NOW() WHERE id = $2")
            .bind(role)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref status) = body.status {
        sqlx::query("UPDATE users SET status = $1::\"UserStatus\", updated_at = NOW() WHERE id = $2")
            .bind(status)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref name) = body.name {
        sqlx::query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }
    if id == user.id {
        return Err(AppError::bad_request("Cannot delete yourself"));
    }

    sqlx::query("UPDATE users SET status = 'DELETED', scheduled_for_deletion_at = NOW() + INTERVAL '30 days', updated_at = NOW() WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn list_permissions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view = user.role == "ADMIN"
        || user.role == "MODERATOR"
        || check_permission(&state.pool, &user.id, "admin.permissions.view").await
        || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_view {
        return Err(AppError::forbidden("Permission required: admin.permissions.view or admin.permissions.manage"));
    }
    let rows = sqlx::query(
        r#"SELECT id, key, name, description, category, module, created_at, updated_at
           FROM permissions ORDER BY category, key"#,
    )
    .fetch_all(&state.pool)
    .await?;
    let permissions: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "key": r.get::<String, _>("key"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "category": r.get::<String, _>("category"),
                "module": r.get::<Option<String>, _>("module"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect();
    Ok(Json(serde_json::json!({ "permissions": permissions })))
}

async fn list_user_permissions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view = user.role == "ADMIN"
        || user.role == "MODERATOR"
        || check_permission(&state.pool, &user.id, "admin.permissions.view").await
        || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_view {
        return Err(AppError::forbidden("Permission required: admin.permissions.view or admin.permissions.manage"));
    }
    let rows = sqlx::query(
        r#"SELECT p.id, p.key, p.name, p.category FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1 ORDER BY p.category, p.key"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let permissions: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "key": r.get::<String, _>("key"),
                "name": r.get::<String, _>("name"),
                "category": r.get::<String, _>("category"),
            })
        })
        .collect();
    Ok(Json(serde_json::json!({ "permissions": permissions })))
}

#[derive(Deserialize)]
struct GrantPermissionRequest {
    key: String,
}

async fn grant_user_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<GrantPermissionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_manage = user.role == "ADMIN" || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_manage {
        return Err(AppError::forbidden("Permission required: admin.permissions.manage"));
    }
    let key = body.key.trim();
    if key.is_empty() {
        return Err(AppError::bad_request("Permission key is required"));
    }
    let perm_id: Option<String> = sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
        .bind(key)
        .fetch_optional(&state.pool)
        .await?;
    let perm_id = perm_id.ok_or_else(|| AppError::not_found("Permission not found"))?;
    let up_id = crate::id::new_cuid();
    sqlx::query(
        r#"INSERT INTO user_permissions (id, user_id, permission_id, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, permission_id) DO NOTHING"#,
    )
    .bind(&up_id)
    .bind(&id)
    .bind(&perm_id)
    .execute(&state.pool)
    .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.permissions.grant".into(),
            resource_type: Some("user".into()),
            resource_id: Some(id),
            context: Some(serde_json::json!({ "permission": key })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn revoke_user_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, key)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_manage = user.role == "ADMIN" || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_manage {
        return Err(AppError::forbidden("Permission required: admin.permissions.manage"));
    }
    let perm_id: Option<String> = sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
        .bind(key.trim())
        .fetch_optional(&state.pool)
        .await?;
    let perm_id = perm_id.ok_or_else(|| AppError::not_found("Permission not found"))?;
    sqlx::query("DELETE FROM user_permissions WHERE user_id = $1 AND permission_id = $2")
        .bind(&id)
        .bind(&perm_id)
        .execute(&state.pool)
        .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.permissions.revoke".into(),
            resource_type: Some("user".into()),
            resource_id: Some(id),
            context: Some(serde_json::json!({ "permission": key })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn list_group_permissions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_view = user.role == "ADMIN"
        || user.role == "MODERATOR"
        || check_permission(&state.pool, &user.id, "admin.permissions.view").await
        || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_view {
        return Err(AppError::forbidden("Permission required: admin.permissions.view or admin.permissions.manage"));
    }
    let rows = sqlx::query(
        r#"SELECT p.id, p.key, p.name, p.category FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           WHERE gp.group_id = $1 ORDER BY p.category, p.key"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let permissions: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "key": r.get::<String, _>("key"),
                "name": r.get::<String, _>("name"),
                "category": r.get::<String, _>("category"),
            })
        })
        .collect();
    Ok(Json(serde_json::json!({ "permissions": permissions })))
}

#[derive(Deserialize)]
struct GrantGroupPermissionRequest {
    key: String,
}

async fn grant_group_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<GrantGroupPermissionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_manage = user.role == "ADMIN" || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_manage {
        return Err(AppError::forbidden("Permission required: admin.permissions.manage"));
    }
    let key = body.key.trim();
    if key.is_empty() {
        return Err(AppError::bad_request("Permission key is required"));
    }
    let perm_id: Option<String> = sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
        .bind(key)
        .fetch_optional(&state.pool)
        .await?;
    let perm_id = perm_id.ok_or_else(|| AppError::not_found("Permission not found"))?;
    let gp_id = crate::id::new_cuid();
    sqlx::query(
        r#"INSERT INTO group_permissions (id, group_id, permission_id, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (group_id, permission_id) DO NOTHING"#,
    )
    .bind(&gp_id)
    .bind(&id)
    .bind(&perm_id)
    .execute(&state.pool)
    .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.permissions.grant".into(),
            resource_type: Some("group".into()),
            resource_id: Some(id),
            context: Some(serde_json::json!({ "permission": key })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn revoke_group_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, key)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let can_manage = user.role == "ADMIN" || check_permission(&state.pool, &user.id, "admin.permissions.manage").await;
    if !can_manage {
        return Err(AppError::forbidden("Permission required: admin.permissions.manage"));
    }
    let perm_id: Option<String> = sqlx::query_scalar("SELECT id FROM permissions WHERE key = $1")
        .bind(key.trim())
        .fetch_optional(&state.pool)
        .await?;
    let perm_id = perm_id.ok_or_else(|| AppError::not_found("Permission not found"))?;
    sqlx::query("DELETE FROM group_permissions WHERE group_id = $1 AND permission_id = $2")
        .bind(&id)
        .bind(&perm_id)
        .execute(&state.pool)
        .await?;
    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.permissions.revoke".into(),
            resource_type: Some("group".into()),
            resource_id: Some(id),
            context: Some(serde_json::json!({ "permission": key })),
            ip_address: None,
            user_agent: None,
        },
    );
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn list_groups(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }

    let rows = sqlx::query(
        r#"SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
                  (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) as member_count,
                  (SELECT COUNT(*) FROM group_permissions gp WHERE gp.group_id = g.id) as permission_count
           FROM groups g ORDER BY g.name ASC"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let groups: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "memberCount": r.get::<i64, _>("member_count"),
                "permissionCount": r.get::<i64, _>("permission_count"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "groups": groups })))
}

#[derive(Deserialize)]
struct CreateGroupRequest {
    name: String,
    description: Option<String>,
}

async fn create_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateGroupRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let id = crate::id::new_cuid();
    sqlx::query("INSERT INTO groups (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())")
        .bind(&id)
        .bind(&body.name)
        .bind(&body.description)
        .execute(&state.pool)
        .await?;

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

async fn get_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }

    let r = sqlx::query("SELECT id, name, description, created_at, updated_at FROM groups WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Group not found"))?;

    let members = sqlx::query(
        r#"SELECT u.id, u.name, u.email, u.role::text as role
           FROM users u
           JOIN group_memberships gm ON gm.user_id = u.id
           WHERE gm.group_id = $1"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;

    let member_list: Vec<serde_json::Value> = members
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m.get::<String, _>("id"),
                "name": m.get::<Option<String>, _>("name"),
                "email": m.get::<String, _>("email"),
                "role": m.get::<String, _>("role"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "group": {
            "id": r.get::<String, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<Option<String>, _>("description"),
            "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
            "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            "members": member_list,
        }
    })))
}

#[derive(Deserialize)]
struct UpdateGroupRequest {
    name: Option<String>,
    description: Option<String>,
}

async fn update_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateGroupRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    if let Some(ref name) = body.name {
        sqlx::query("UPDATE groups SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(name)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref desc) = body.description {
        sqlx::query("UPDATE groups SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(desc)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_group(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    sqlx::query("DELETE FROM group_memberships WHERE group_id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    sqlx::query("DELETE FROM group_permissions WHERE group_id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn list_modules(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let rows = sqlx::query("SELECT id, key, name, description, enabled, created_at FROM modules ORDER BY name ASC")
        .fetch_all(&state.pool)
        .await?;

    let modules: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "key": r.get::<String, _>("key"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "enabled": r.get::<bool, _>("enabled"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "modules": modules })))
}

#[derive(Deserialize)]
struct ToggleModuleRequest {
    enabled: bool,
}

async fn toggle_module(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ToggleModuleRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    sqlx::query("UPDATE modules SET enabled = $1 WHERE id = $2")
        .bind(body.enabled)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize, Default)]
struct SessionListParams {
    search: Option<String>,
}

async fn list_sessions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SessionListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let search = params.search.unwrap_or_default();
    let pattern = format!("%{search}%");

    let rows = sqlx::query(
        r#"SELECT s.id, s.user_id, s.device_name, s.device_type, s.ip_address,
                  s.user_agent, s.expires_at, s.created_at,
                  u.name as user_name, u.email as user_email
           FROM sessions s
           JOIN users u ON s.user_id = u.id
           WHERE s.expires_at > NOW()
             AND ($1::text = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
           ORDER BY s.created_at DESC
           LIMIT 100"#,
    )
    .bind(&search)
    .bind(&pattern)
    .fetch_all(&state.pool)
    .await?;

    let sessions: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "userId": r.get::<String, _>("user_id"),
                "userName": r.get::<Option<String>, _>("user_name"),
                "userEmail": r.get::<String, _>("user_email"),
                "deviceName": r.get::<Option<String>, _>("device_name"),
                "deviceType": r.get::<Option<String>, _>("device_type"),
                "ipAddress": r.get::<Option<String>, _>("ip_address"),
                "userAgent": r.get::<Option<String>, _>("user_agent"),
                "expiresAt": r.get::<chrono::NaiveDateTime, _>("expires_at"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "sessions": sessions })))
}

async fn revoke_session(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let target_user_id: Option<String> =
        sqlx::query_scalar("SELECT user_id FROM sessions WHERE id = $1")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?;

    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id),
            action: "admin.sessions.revoke".into(),
            resource_type: Some("session".into()),
            resource_id: Some(id),
            context: target_user_id.map(|uid| serde_json::json!({ "target_user_id": uid })),
            ip_address: None,
            user_agent: None,
        },
    );

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn admin_statistics(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE status = 'ACTIVE'")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let ticket_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let todo_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let link_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM links")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let session_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()")
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
    let open_tickets: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tickets WHERE status IN ('OPEN', 'IN_PROGRESS', 'PENDING')",
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "users": user_count,
        "tickets": ticket_count,
        "todos": todo_count,
        "links": link_count,
        "activeSessions": session_count,
        "openTickets": open_tickets,
    })))
}

async fn admin_dashboard_stats(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let user_status_rows = sqlx::query(
        "SELECT status::text as status, COUNT(*) as cnt FROM users GROUP BY status",
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let mut users_by_status = serde_json::json!({
        "ACTIVE": 0,
        "PENDING": 0,
        "SUSPENDED": 0,
        "DELETED": 0,
    });
    let obj = users_by_status.as_object_mut().unwrap();
    for row in &user_status_rows {
        let status: String = row.get::<String, _>("status");
        let cnt: i64 = row.get::<i64, _>("cnt");
        if obj.contains_key(&status) {
            obj[&status] = serde_json::json!(cnt);
        }
    }

    let total_tickets: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let ticket_status_rows = sqlx::query(
        "SELECT status::text as status, COUNT(*) as cnt FROM tickets GROUP BY status",
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let mut tickets_by_status = serde_json::json!({
        "OPEN": 0,
        "IN_PROGRESS": 0,
        "PENDING": 0,
        "RESOLVED": 0,
        "CLOSED": 0,
        "CANCELLED": 0,
    });
    let tobj = tickets_by_status.as_object_mut().unwrap();
    for row in &ticket_status_rows {
        let status: String = row.get::<String, _>("status");
        let cnt: i64 = row.get::<i64, _>("cnt");
        if tobj.contains_key(&status) {
            tobj[&status] = serde_json::json!(cnt);
        }
    }

    let active_sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let enabled_modules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM modules WHERE enabled = true")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let total_modules: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM modules")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let total_groups: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM groups")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let seven_days_ago = chrono::Utc::now().naive_utc() - chrono::Duration::days(7);
    let recent_registrations: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE created_at >= $1",
    )
    .bind(seven_days_ago)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let recent_tickets: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tickets WHERE created_at >= $1",
    )
    .bind(seven_days_ago)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let total_todos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todos")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let total_links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM links")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "totalUsers": total_users,
        "usersByStatus": users_by_status,
        "totalTickets": total_tickets,
        "ticketsByStatus": tickets_by_status,
        "todos": total_todos,
        "links": total_links,
        "activeSessions": active_sessions,
        "enabledModules": enabled_modules,
        "totalModules": total_modules,
        "totalGroups": total_groups,
        "recentRegistrations": recent_registrations,
        "recentTickets": recent_tickets,
    })))
}

/// Time-series and breakdowns for admin analytics (tickets over time, time tracked, priority).
async fn admin_statistics_analytics(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
    }

    let days = 30;
    let start = chrono::Utc::now().naive_utc().date() - chrono::Duration::days(days);

    let tickets_by_day: Vec<(chrono::NaiveDate, i64)> = sqlx::query_as(
        r#"SELECT (created_at AT TIME ZONE 'UTC')::date as d, COUNT(*)::bigint
           FROM tickets WHERE (created_at AT TIME ZONE 'UTC')::date >= $1
           GROUP BY (created_at AT TIME ZONE 'UTC')::date ORDER BY d"#,
    )
    .bind(start)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let time_by_day: Vec<(chrono::NaiveDate, i64)> = sqlx::query_as(
        r#"SELECT (created_at AT TIME ZONE 'UTC')::date as d, COALESCE(SUM(total_duration), 0)::bigint
           FROM time_entries WHERE archived_at IS NULL AND (created_at AT TIME ZONE 'UTC')::date >= $1
           GROUP BY (created_at AT TIME ZONE 'UTC')::date ORDER BY d"#,
    )
    .bind(start)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let users_by_day: Vec<(chrono::NaiveDate, i64)> = sqlx::query_as(
        r#"SELECT (created_at AT TIME ZONE 'UTC')::date as d, COUNT(*)::bigint
           FROM users WHERE (created_at AT TIME ZONE 'UTC')::date >= $1
           GROUP BY (created_at AT TIME ZONE 'UTC')::date ORDER BY d"#,
    )
    .bind(start)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let tickets_by_priority_rows = sqlx::query(
        r#"SELECT priority::text as priority, COUNT(*)::bigint as cnt FROM tickets GROUP BY priority"#,
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let mut tickets_by_priority = serde_json::json!({
        "LOW": 0,
        "MEDIUM": 0,
        "HIGH": 0,
        "URGENT": 0,
    });
    let pobj = tickets_by_priority.as_object_mut().unwrap();
    for row in &tickets_by_priority_rows {
        let p: String = row.get::<String, _>("priority");
        let cnt: i64 = row.get::<i64, _>("cnt");
        if pobj.contains_key(&p) {
            pobj[&p] = serde_json::json!(cnt);
        }
    }

    let tickets_created_by_day: Vec<serde_json::Value> = tickets_by_day
        .iter()
        .map(|(d, c)| {
            serde_json::json!({
                "date": d.format("%Y-%m-%d").to_string(),
                "count": c,
            })
        })
        .collect();

    let time_tracked_by_day: Vec<serde_json::Value> = time_by_day
        .iter()
        .map(|(d, s)| {
            serde_json::json!({
                "date": d.format("%Y-%m-%d").to_string(),
                "totalSeconds": s,
            })
        })
        .collect();

    let users_created_by_day: Vec<serde_json::Value> = users_by_day
        .iter()
        .map(|(d, c)| {
            serde_json::json!({
                "date": d.format("%Y-%m-%d").to_string(),
                "count": c,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "ticketsCreatedByDay": tickets_created_by_day,
        "timeTrackedByDay": time_tracked_by_day,
        "usersCreatedByDay": users_created_by_day,
        "ticketsByPriority": tickets_by_priority,
    })))
}

async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows: Vec<NotificationRow> = sqlx::query_as(
        r#"SELECT id, user_id, type::text as type, title, body, resource_type, resource_id,
                  resource_url, read, created_at
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await?;

    let notifications: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "type": r.r#type,
                "title": r.title,
                "body": r.body,
                "resourceType": r.resource_type,
                "resourceId": r.resource_id,
                "resourceUrl": r.resource_url,
                "read": r.read,
                "createdAt": r.created_at,
            })
        })
        .collect();

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false",
    )
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "notifications": notifications,
        "unreadCount": unread_count,
    })))
}

async fn mark_notification_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
