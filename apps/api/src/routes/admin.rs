use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::helpers::check_permission;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/audit/events", get(audit_events))
        .route("/admin/db-query", post(db_query))
        .route("/admin/purge-deleted-accounts", post(purge_deleted))
        .route("/admin/users", get(list_users))
        .route(
            "/admin/users/{id}",
            get(get_user).patch(update_user).delete(delete_user),
        )
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
        .route("/admin/modules", get(list_modules))
        .route("/admin/modules/{id}", patch(toggle_module))
        .route("/admin/sessions", get(list_sessions))
        .route("/admin/sessions/{id}", axum::routing::delete(revoke_session))
        .route("/admin/statistics", get(admin_statistics))
        .route("/admin/dashboard-stats", get(admin_dashboard_stats))
        .route("/admin/settings", get(admin_settings))
        .route("/admin/settings/links-page-size", axum::routing::patch(update_links_page_size))
        .route("/admin/settings/qr-login-rate-limit", axum::routing::patch(update_qr_login_rate_limit))
        .route("/notifications", get(list_notifications))
        .route("/notifications/{id}/read", post(mark_notification_read))
}

async fn audit_events(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "audit.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let rows = sqlx::query(
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
                "id": r.get::<String, _>("id"),
                "user_id": r.get::<Option<String>, _>("user_id"),
                "action": r.get::<String, _>("action"),
                "resource_type": r.get::<Option<String>, _>("resource_type"),
                "resource_id": r.get::<Option<String>, _>("resource_id"),
                "context": r.get::<Option<serde_json::Value>, _>("context"),
                "ip_address": r.get::<Option<String>, _>("ip_address"),
                "user_agent": r.get::<Option<String>, _>("user_agent"),
                "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
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
        r#"SELECT id, email, name, role::text as role, status::text as status,
                  email_verified, avatar, timezone, theme, locale, bio,
                  last_login_at, created_at, updated_at
           FROM users
           WHERE ($1::text = '' OR name ILIKE $2 OR email ILIKE $2)
             AND ($3::text IS NULL OR status::text = $3)
             AND ($4::text IS NULL OR role::text = $4)
           ORDER BY created_at DESC
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
                  last_login_at, created_at, updated_at
           FROM users WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::not_found("User not found"))?;

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
            "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
            "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
        }
    })))
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
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
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
    if user.role != "ADMIN" && user.role != "MODERATOR" {
        return Err(AppError::forbidden("Admin access required"));
    }
    let rows = sqlx::query(
        r#"SELECT p.key, p.name, p.category FROM user_permissions up
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
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
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
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn revoke_user_permission(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, key)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if user.role != "ADMIN" {
        return Err(AppError::forbidden("Admin only"));
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
                  (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) as member_count
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

    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

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

    Ok(Json(serde_json::json!({
        "totalUsers": total_users,
        "usersByStatus": users_by_status,
        "totalTickets": total_tickets,
        "ticketsByStatus": tickets_by_status,
        "activeSessions": active_sessions,
        "enabledModules": enabled_modules,
        "totalModules": total_modules,
        "totalGroups": total_groups,
        "recentRegistrations": recent_registrations,
        "recentTickets": recent_tickets,
    })))
}

async fn list_notifications(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows = sqlx::query(
        r#"SELECT id, type::text as type, title, body, resource_type, resource_id,
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
                "id": r.get::<String, _>("id"),
                "type": r.get::<String, _>("type"),
                "title": r.get::<String, _>("title"),
                "body": r.get::<Option<String>, _>("body"),
                "resourceType": r.get::<Option<String>, _>("resource_type"),
                "resourceId": r.get::<Option<String>, _>("resource_id"),
                "resourceUrl": r.get::<Option<String>, _>("resource_url"),
                "read": r.get::<bool, _>("read"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
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
