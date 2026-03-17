use axum::{extract::State, routing::get, Json, Router};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::user::MeResponse;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/me", get(me))
}

async fn me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<MeResponse>, AppError> {
    let rows = sqlx::query("SELECT key FROM modules WHERE enabled = true")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let client_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| {
            let key: String = r.get("key");
            match key.as_str() {
                "tickets" => Some("tickets".to_string()),
                "timetracking" => Some("time_tracking".to_string()),
                "todos" => Some("todos".to_string()),
                "links" => Some("links".to_string()),
                _ => None,
            }
        })
        .collect();

    let mut modules = client_ids;
    if modules.contains(&"tickets".to_string()) || modules.contains(&"links".to_string()) {
        modules.push("archive".to_string());
    }

    Ok(Json(MeResponse {
        name: user.name,
        email: user.email,
        modules,
    }))
}
