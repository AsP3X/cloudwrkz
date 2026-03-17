use sqlx::{PgPool, Row};

use crate::models::ticket::GroupSummary;
use crate::models::user::UserSummary;

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
