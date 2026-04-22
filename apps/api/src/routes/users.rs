//! Active users list for collection sharing and similar pickers (authenticated).

// Human: Sharing dialogs need a searchable pool of active accounts without exposing banned or inactive users.
// Agent: GET /users; REQUIRES AuthUser; SELECT ACTIVE users id,name,email ORDER BY COALESCE(name,email) LIMIT 2000.

use axum::{Json, Router, extract::State, routing::get};
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/users", get(list_active_users))
}

async fn list_active_users(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    // Human: The cap prevents accidentally returning tens of thousands of rows to the browser in one JSON payload.
    // Agent: QUERY users WHERE status ACTIVE; MAP rows to {id,name,email}; WRAPS { users: array }.

    let rows = sqlx::query(
        r#"SELECT id, name, email FROM users
           WHERE status = 'ACTIVE'
           ORDER BY COALESCE(name, email) ASC
           LIMIT 2000"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let users: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<Option<String>, _>("name"),
                "email": r.get::<String, _>("email"),
            })
        })
        .collect();

    Ok(Json(json!({ "users": users })))
}
