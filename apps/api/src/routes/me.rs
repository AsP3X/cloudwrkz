//! `GET /me` returns the current user, enabled module identifiers for the shell UI, and profile metadata.
//! `GET/DELETE /me/sessions*` lets users inspect and revoke their own login sessions.

// Human: Module visibility is explicit-permission based—missing permission keys hide entire product areas instead of defaulting to “show all”.
// Agent: get_user_permission_keys; QUERY modules enabled; MAP MODULE_VIEW_PERMISSION; INJECT archive when tickets or links visible.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{delete, get},
};
use sqlx::Row;

use crate::audit;
use crate::auth::device_identity::{
    ClientDeviceReport, enrich_stored_fields, resolve_device_identity,
};
use crate::auth::extractors::{AuthUser, extract_token_from_headers};
use crate::error::AppError;
use crate::models::user::MeResponse;
use crate::routes::AppState;
use crate::routes::helpers::get_user_permission_keys;

/// Map module key (DB) to the permission key required to view that module.
const MODULE_VIEW_PERMISSION: &[(&str, &str)] = &[
    ("tickets", "modules.tickets.view"),
    ("timetracking", "modules.timetracking.view"),
    ("todos", "modules.todos.view"),
    ("links", "modules.links.view"),
    ("employees", "modules.employees.view"),
    ("customers", "modules.customers.view"),
];

// Human: Authenticated self-service routes for profile bootstrap and session management under the v1 router.
// Agent: Router GET /me; GET/DELETE /me/sessions*; static /others before /{id}; WITH_STATE AppState.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/me", get(me))
        .route("/me/sessions", get(list_my_sessions).delete(revoke_all_my_sessions))
        .route("/me/sessions/others", delete(revoke_other_my_sessions))
        .route("/me/sessions/{id}", delete(revoke_my_session))
}

// Human: Builds `MeResponse` by intersecting enabled modules with the caller’s permission set and normalizing client module ids (`time_tracking` vs `timetracking`).
// Agent: READ users created_at bio last_login; RETURNS MeResponse Json OR sqlx mapped errors as AppError upstream.

async fn me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<MeResponse>, AppError> {
    let permissions = get_user_permission_keys(&state.pool, &user.id).await;
    let perm_set: std::collections::HashSet<_> = permissions.iter().map(String::as_str).collect();

    // Match Next.js: module visibility requires explicit permission (modules.*.view or module-specific perms).
    // No "empty permissions = show all" fallback; no permissions = no module access.
    let rows = sqlx::query("SELECT key FROM modules WHERE enabled = true")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let client_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| {
            let key: String = r.get("key");
            let required = MODULE_VIEW_PERMISSION
                .iter()
                .find(|(k, _)| *k == key.as_str())
                .map(|(_, p)| *p);
            let allowed = match required {
                Some(perm) => perm_set.contains(perm),
                None => true,
            };
            if allowed {
                match key.as_str() {
                    "tickets" => Some("tickets".to_string()),
                    "timetracking" => Some("time_tracking".to_string()),
                    "todos" => Some("todos".to_string()),
                    "links" => Some("links".to_string()),
                    "employees" => Some("employees".to_string()),
                    "customers" => Some("customers".to_string()),
                    _ => None,
                }
            } else {
                None
            }
        })
        .collect();

    let mut modules = client_ids;
    if perm_set.contains("archive.view")
        && (modules.contains(&"tickets".to_string()) || modules.contains(&"links".to_string()))
        && !modules.contains(&"archive".to_string())
    {
        modules.push("archive".to_string());
    }

    let row = sqlx::query("SELECT created_at, bio, last_login_at FROM users WHERE id = $1")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();

    let (created_at, bio, last_login_at) = match row {
        Some(r) => {
            let created_at: chrono::NaiveDateTime = r.get("created_at");
            let bio: Option<String> = r.get("bio");
            let last_login_at: Option<chrono::NaiveDateTime> = r.get("last_login_at");
            (
                format_naive_datetime_iso(&created_at),
                bio,
                last_login_at.map(|dt| format_naive_datetime_iso(&dt)),
            )
        }
        None => (String::new(), None, None),
    };

    Ok(Json(MeResponse {
        id: user.id.clone(),
        name: user.name.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
        status: user.status.clone(),
        avatar: user.avatar.clone(),
        timezone: user.timezone.clone(),
        theme: user.theme.clone(),
        email_verified: user.email_verified,
        created_at,
        bio,
        last_login_at,
        modules,
        permissions,
    }))
}

// Human: Returns every session row for the signed-in user so the settings dialog can split active vs expired lists.
// Agent: SELECT sessions WHERE user_id; MARK isCurrent via request token match; ORDER created_at DESC; JSON sessions[].

async fn list_my_sessions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let current_token = extract_token_from_headers(&headers);
    let request_ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let request_hints = crate::auth::device_identity::client_hints_from_headers(&headers);

    let rows = sqlx::query(
        r#"SELECT id, token, device_name, device_type, device_os, device_browser,
                  user_agent, ip_address, created_at, expires_at
           FROM sessions
           WHERE user_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await?;

    let sessions: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let token: String = r.get("token");
            let created_at: chrono::NaiveDateTime = r.get("created_at");
            let expires_at: chrono::NaiveDateTime = r.get("expires_at");
            let is_current = current_token
                .as_ref()
                .is_some_and(|t| t == &token);
            let user_agent: Option<String> = r.get("user_agent");
            let mut device = enrich_stored_fields(
                r.try_get("device_name").ok().flatten(),
                r.try_get("device_type").ok().flatten(),
                r.try_get("device_os").ok().flatten(),
                r.try_get("device_browser").ok().flatten(),
                user_agent.as_deref(),
            );
            // Human: Legacy web sessions may have empty device columns and no stored UA — use the live request for the current token only.
            // Agent: is_current AND sparse device fields; MERGE resolve_device_identity(request UA + Client Hints).
            if is_current
                && device.device_name.is_none()
                && request_ua.as_deref().is_some_and(|ua| !ua.trim().is_empty())
            {
                let live = resolve_device_identity(
                    request_ua.as_deref(),
                    &ClientDeviceReport::default(),
                    &request_hints,
                );
                device.device_name = device.device_name.or(live.device_name);
                device.device_type = device.device_type.or(live.device_type);
                device.device_os = device.device_os.or(live.device_os);
                device.device_browser = device.device_browser.or(live.device_browser);
            }
            let display_user_agent = user_agent.or_else(|| {
                if is_current {
                    request_ua.clone()
                } else {
                    None
                }
            });

            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "isCurrent": is_current,
                "deviceName": device.device_name,
                "deviceType": device.device_type,
                "deviceOs": device.device_os,
                "deviceBrowser": device.device_browser,
                "userAgent": display_user_agent,
                "ipAddress": r.get::<Option<String>, _>("ip_address"),
                "createdAt": format_naive_datetime_iso(&created_at),
                "expiresAt": format_naive_datetime_iso(&expires_at),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "sessions": sessions })))
}

// Human: Users can revoke one of their own sessions; deleting the current token logs them out on the next request.
// Agent: SELECT session id+token WHERE user_id; DELETE by id; audit sessions.revoke; 404 when missing or foreign.

async fn revoke_my_session(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query("SELECT id FROM sessions WHERE id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?;

    if row.is_none() {
        return Err(AppError::not_found("Session not found"));
    }

    sqlx::query("DELETE FROM sessions WHERE id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    audit::write_audit_from_headers(
        &state.pool,
        Some(user.id.clone()),
        "sessions.revoke",
        Some("session"),
        Some(id),
        None,
        &headers,
    );

    Ok(Json(serde_json::json!({ "success": true })))
}

// Human: “Log out other devices” keeps the caller’s bearer/cookie session and removes every other row for that user.
// Agent: READ current token; DELETE sessions WHERE user_id AND token <> current; audit sessions.revoke.others.

async fn revoke_other_my_sessions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let current_token = extract_token_from_headers(&headers)
        .ok_or_else(|| AppError::unauthorized("Missing authentication token"))?;

    let result = sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND token <> $2")
        .bind(&user.id)
        .bind(&current_token)
        .execute(&state.pool)
        .await?;

    audit::write_audit_from_headers(
        &state.pool,
        Some(user.id.clone()),
        "sessions.revoke.others",
        Some("user"),
        Some(user.id.clone()),
        Some(serde_json::json!({ "revoked_count": result.rows_affected() })),
        &headers,
    );

    Ok(Json(serde_json::json!({ "success": true })))
}

// Human: “Log out everywhere” deletes every session for the account, including the one making the request.
// Agent: DELETE sessions WHERE user_id; audit sessions.revoke.all; client clears token and redirects to login.

async fn revoke_all_my_sessions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    audit::write_audit_from_headers(
        &state.pool,
        Some(user.id.clone()),
        "sessions.revoke.all",
        Some("user"),
        Some(user.id.clone()),
        Some(serde_json::json!({ "revoked_count": result.rows_affected() })),
        &headers,
    );

    Ok(Json(serde_json::json!({ "success": true })))
}

// Human: Vite settings dialogs expect ISO-8601 strings with a trailing Z, matching other `/me` timestamp fields.
// Agent: FORMAT NaiveDateTime %Y-%m-%dT%H:%M:%S%.3fZ; PURE helper; NO timezone conversion.

fn format_naive_datetime_iso(dt: &chrono::NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}
