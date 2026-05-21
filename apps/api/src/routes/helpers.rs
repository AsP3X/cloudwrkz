//! Shared route helpers: permission checks inside transactions, user/group summaries, idempotency header parsing.

// Human: Centralizing RBAC queries keeps ticket/todo handlers consistent and avoids copy-pasting the same JOIN across dozens of files.
// Agent: check_permission + authorize + get_permission_breakdown; get_user_permission_keys UNION keys; ensure_default_group_membership; hash_json_for_idempotency DefaultHasher.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use axum::http::HeaderMap;
use serde::Serialize;
use sqlx::{Executor, PgPool, Postgres, Row, Transaction};

use crate::error::AppError;
use crate::models::ticket::{CommentAuthor, GroupSummary};
use crate::models::user::UserSummary;
use crate::permissions::{self, ADMIN_GROUP_ID, DEFAULT_GROUP_ID, MODERATOR_GROUP_ID};

/// Direct user grants plus group-derived keys for admin tooling and `/me`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupPermissionSource {
    pub group_id: String,
    pub group_name: String,
    pub keys: Vec<String>,
}

/// Breakdown of how a user received their effective permission keys.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionBreakdown {
    pub direct: Vec<String>,
    pub from_groups: Vec<GroupPermissionSource>,
    pub effective: Vec<String>,
}

// Human: Route handlers call this instead of inlining role checks so authorization always flows through atomic permission keys.
// Agent: CALLS check_permission; RETURNS Ok(()) OR AppError::forbidden with key in message.

pub async fn require_permission(pool: &PgPool, user_id: &str, permission_key: &str) -> Result<(), AppError> {
    if check_permission(pool, user_id, permission_key).await {
        Ok(())
    } else {
        Err(AppError::forbidden(&format!(
            "Permission required: {permission_key}"
        )))
    }
}

/// Succeeds when the user holds at least one of the listed permission keys.
pub async fn require_any_permission(
    pool: &PgPool,
    user_id: &str,
    permission_keys: &[&str],
) -> Result<(), AppError> {
    for key in permission_keys {
        if check_permission(pool, user_id, key).await {
            return Ok(());
        }
    }
    Err(AppError::forbidden(&format!(
        "Permission required: one of {}",
        permission_keys.join(", ")
    )))
}

/// Links list/detail require `links.view`; archived lists also require `links.archive`.
pub async fn require_links_read(
    pool: &PgPool,
    user_id: &str,
    viewing_archived: bool,
) -> Result<(), AppError> {
    require_permission(pool, user_id, permissions::key::LINKS_VIEW).await?;
    if viewing_archived {
        require_permission(pool, user_id, permissions::key::LINKS_ARCHIVE).await?;
    }
    Ok(())
}

// Human: Direct grants win first; if absent we look at any group membership that carries the permission bit.
// Agent: TWO SELECT COUNT queries user_permissions then group_permissions+group_memberships; RETURNS bool OR unwrap_or(0) on sqlx Err -> false path? Actually unwrap_or(0) on fetch.

pub async fn check_permission(pool: &PgPool, user_id: &str, permission_key: &str) -> bool {
    let direct: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if direct > 0 {
        return true;
    }

    let group: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           JOIN group_memberships gm ON gm.group_id = gp.group_id
           WHERE gm.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    group > 0
}

/// Same as [`check_permission`] but uses an open PostgreSQL transaction (e.g. after `FOR UPDATE`).
// Human: Inside a transaction we must not open a new connection from the pool, so the SQL is duplicated against `&mut **tx`.
// Agent: IDENTICAL JOIN logic to check_permission; EXECUTES fetch_one on active tx.

pub async fn check_permission_mut_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    permission_key: &str,
) -> bool {
    let direct: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(&mut **tx)
    .await
    .unwrap_or(0);

    if direct > 0 {
        return true;
    }

    let group: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           JOIN group_memberships gm ON gm.group_id = gp.group_id
           WHERE gm.user_id = $1 AND p.key = $2"#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(&mut **tx)
    .await
    .unwrap_or(0);

    group > 0
}

/// Returns all permission keys the user has (from user_permissions and group_permissions).
// Human: `/me` and admin tooling need the full key set as strings for module gating and UI feature flags.
// Agent: TWO fetch_all queries; INSERT into HashSet; RETURNS sorted? into_iter collect unsorted Vec.

pub async fn get_user_permission_keys(pool: &PgPool, user_id: &str) -> Vec<String> {
    let mut keys = std::collections::HashSet::new();

    let direct: Vec<String> = sqlx::query_scalar(
        r#"SELECT p.key FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for k in direct {
        keys.insert(k);
    }

    let from_groups: Vec<String> = sqlx::query_scalar(
        r#"SELECT DISTINCT p.key FROM group_permissions gp
           JOIN permissions p ON gp.permission_id = p.id
           JOIN group_memberships gm ON gm.group_id = gp.group_id
           WHERE gm.user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for k in from_groups {
        keys.insert(k);
    }

    keys.into_iter().collect()
}

// Human: First-run bootstrap admins need every permission key so `/me` and the Vite `can()` checks work (role alone is not enough).
// Agent: INSERT user_permissions SELECT all permissions.id; id prefix bootstrap-{user_id}-; ON CONFLICT DO NOTHING; works on pool or tx Executor.
pub async fn grant_all_permissions_to_user<'e, E>(executor: E, user_id: &str) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"INSERT INTO user_permissions (id, user_id, permission_id, created_at)
           SELECT 'bootstrap-' || $1 || '-' || p.id, $1, p.id, NOW()
           FROM permissions p
           ON CONFLICT (user_id, permission_id) DO NOTHING"#,
    )
    .bind(user_id)
    .execute(executor)
    .await?;
    Ok(())
}

/// Loads direct, per-group, and effective permission keys for admin user-permission screens.
pub async fn get_permission_breakdown(pool: &PgPool, user_id: &str) -> Result<PermissionBreakdown, AppError> {
    let direct: Vec<String> = sqlx::query_scalar(
        r#"SELECT p.key FROM user_permissions up
           JOIN permissions p ON up.permission_id = p.id
           WHERE up.user_id = $1 ORDER BY p.key"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let group_rows = sqlx::query(
        r#"SELECT g.id, g.name, p.key
           FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id
           JOIN group_permissions gp ON gp.group_id = g.id
           JOIN permissions p ON p.id = gp.permission_id
           WHERE gm.user_id = $1
           ORDER BY g.name, p.key"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut from_groups_map: std::collections::BTreeMap<(String, String), Vec<String>> =
        std::collections::BTreeMap::new();
    for row in group_rows {
        let group_id: String = row.get("id");
        let group_name: String = row.get("name");
        let key: String = row.get("key");
        from_groups_map
            .entry((group_id, group_name))
            .or_default()
            .push(key);
    }

    let from_groups: Vec<GroupPermissionSource> = from_groups_map
        .into_iter()
        .map(|((group_id, group_name), mut keys)| {
            keys.sort();
            keys.dedup();
            GroupPermissionSource {
                group_id,
                group_name,
                keys,
            }
        })
        .collect();

    let effective = get_user_permission_keys(pool, user_id).await;
    Ok(PermissionBreakdown {
        direct,
        from_groups,
        effective,
    })
}

/// Ensures the user belongs to the Default group so baseline module permissions apply after registration.
pub async fn ensure_default_group_membership(
    pool: &PgPool,
    user_id: &str,
) -> Result<(), AppError> {
    ensure_group_membership(pool, user_id, DEFAULT_GROUP_ID).await
}

/// Adds a user to a group when not already a member (idempotent).
pub async fn ensure_group_membership(
    pool: &PgPool,
    user_id: &str,
    group_id: &str,
) -> Result<(), AppError> {
    let membership_id = crate::id::new_cuid();
    sqlx::query(
        r#"INSERT INTO group_memberships (id, user_id, group_id, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, group_id) DO NOTHING"#,
    )
    .bind(&membership_id)
    .bind(user_id)
    .bind(group_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Transaction-scoped variant for user creation flows that already hold an open tx.
pub async fn ensure_group_membership_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    group_id: &str,
) -> Result<(), AppError> {
    let membership_id = crate::id::new_cuid();
    sqlx::query(
        r#"INSERT INTO group_memberships (id, user_id, group_id, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, group_id) DO NOTHING"#,
    )
    .bind(&membership_id)
    .bind(user_id)
    .bind(group_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Assigns Default plus Admin/Moderator groups when a user's role label is set at creation or update.
pub async fn sync_groups_for_role_label(
    pool: &PgPool,
    user_id: &str,
    role: &str,
) -> Result<(), AppError> {
    ensure_default_group_membership(pool, user_id).await?;
    if role == "ADMIN" {
        ensure_group_membership(pool, user_id, ADMIN_GROUP_ID).await?;
    } else if role == "MODERATOR" {
        ensure_group_membership(pool, user_id, MODERATOR_GROUP_ID).await?;
    }
    Ok(())
}

/// True when the caller may update a ticket they did not create (agent/admin paths).
pub async fn can_update_others_ticket_mut_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
) -> bool {
    check_permission_mut_tx(tx, user_id, permissions::key::TICKETS_UPDATE).await
        && (check_permission_mut_tx(tx, user_id, permissions::key::TICKETS_VIEW_ALL).await
            || check_permission_mut_tx(tx, user_id, permissions::key::ADMIN_TICKETS_MANAGE).await)
}

/// True when the caller may delete a ticket they did not create.
pub async fn can_delete_others_ticket_mut_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
) -> bool {
    check_permission_mut_tx(tx, user_id, permissions::key::TICKETS_DELETE).await
        && (check_permission_mut_tx(tx, user_id, permissions::key::TICKETS_VIEW_ALL).await
            || check_permission_mut_tx(tx, user_id, permissions::key::ADMIN_TICKETS_MANAGE).await)
}

// Human: Ticket list items embed a small user card; this helper maps `users` columns into `UserSummary` without leaking password hash.
// Agent: SELECT id name email status FROM users; MAPS Option via ok().flatten() swallowing errors to None.

pub async fn fetch_user_summary(pool: &PgPool, user_id: &str) -> Option<UserSummary> {
    sqlx::query("SELECT id, name, email, status::text as status FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|r| UserSummary {
            id: r.get("id"),
            name: r.get("name"),
            email: r.get("email"),
            status: r.get("status"),
        })
}

// Human: Assignment pickers need group name/description alongside ticket rows loaded in one query batch.
// Agent: SELECT groups id name description by id; Option map GroupSummary.

pub async fn fetch_group_summary(pool: &PgPool, group_id: &str) -> Option<GroupSummary> {
    sqlx::query("SELECT id, name, description FROM groups WHERE id = $1")
        .bind(group_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|r| GroupSummary {
            id: r.get("id"),
            name: r.get("name"),
            description: r.get("description"),
        })
}

/// User summary with role for comment author (e.g. role badge in UI).
// Human: Comment threads show moderator vs user roles, so this variant includes `role` unlike the slimmer `UserSummary`.
// Agent: SELECT id name email status role FROM users; MAPS CommentAuthor.

pub async fn fetch_comment_author(pool: &PgPool, user_id: &str) -> Option<CommentAuthor> {
    sqlx::query("SELECT id, name, email, status::text as status, role::text as role FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|r| CommentAuthor {
            id: r.get("id"),
            name: r.get("name"),
            email: r.get("email"),
            status: r.get("status"),
            role: r.get("role"),
        })
}

// Human: Reads the standard `Idempotency-Key` header case-sensitively per HTTP spec usage in our clients.
// Agent: READS header idempotency-key; TRIMS non-empty string.

pub fn idempotency_key_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// Human: Idempotency entries key off a stable hash of the JSON body so retries with identical payloads replay cached responses.
// Agent: serde_json::to_vec; DefaultHasher HASH bytes; finish u64.

pub fn hash_json_for_idempotency<T: serde::Serialize>(value: &T) -> u64 {
    let bytes = serde_json::to_vec(value).unwrap_or_default();
    let mut h = DefaultHasher::new();
    bytes.hash(&mut h);
    h.finish()
}

/// Attach audit metadata to a background job payload before enqueue.
// Human: Mutation routes call this so async workers can write audit rows with the caller's IP and User-Agent.
// Agent: DELEGATES audit::attach_audit_fields; INPUT job JSON object + HeaderMap; OUTPUT payload with audit_ip/audit_user_agent.

pub fn attach_audit_to_job_payload(
    payload: serde_json::Value,
    headers: &HeaderMap,
) -> serde_json::Value {
    crate::audit::attach_audit_fields(payload, headers)
}
