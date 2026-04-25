//! Shared route helpers: permission checks inside transactions, user/group summaries, idempotency header parsing.

// Human: Centralizing RBAC queries keeps ticket/todo handlers consistent and avoids copy-pasting the same JOIN across dozens of files.
// Agent: check_permission + check_permission_mut_tx COUNT user_permissions OR group_permissions; get_user_permission_keys UNION keys; hash_json_for_idempotency DefaultHasher.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use axum::http::HeaderMap;
use sqlx::{PgPool, Postgres, Row};

use crate::models::ticket::{CommentAuthor, GroupSummary};
use crate::models::user::UserSummary;

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
