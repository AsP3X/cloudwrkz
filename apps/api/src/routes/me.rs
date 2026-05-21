//! `GET /me` returns the current user, enabled module identifiers for the shell UI, and profile metadata.

// Human: Module visibility is explicit-permission based—missing permission keys hide entire product areas instead of defaulting to “show all”.
// Agent: get_user_permission_keys; QUERY modules enabled; MAP MODULE_VIEW_PERMISSION; INJECT archive when tickets or links visible.

use axum::{Json, Router, extract::State, routing::get};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
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
];

// Human: Single authenticated endpoint mounted under the v1 router for session bootstrap after login.
// Agent: Router GET /me WITH_STATE AppState.

pub fn router() -> Router<AppState> {
    Router::new().route("/me", get(me))
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
                created_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                bio,
                last_login_at.map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()),
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
