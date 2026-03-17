use axum::{extract::State, routing::patch, Json, Router};
use serde::Deserialize;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/profile/preferences", patch(update_preferences))
}

#[derive(Deserialize)]
struct PreferencesUpdate {
    locale: Option<String>,
    timezone: Option<String>,
    theme: Option<String>,
}

async fn update_preferences(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<PreferencesUpdate>,
) -> Result<Json<serde_json::Value>, AppError> {
    if let Some(ref locale) = body.locale {
        sqlx::query("UPDATE users SET locale = $1, updated_at = NOW() WHERE id = $2")
            .bind(locale)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref tz) = body.timezone {
        sqlx::query("UPDATE users SET timezone = $1, updated_at = NOW() WHERE id = $2")
            .bind(tz)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref theme) = body.theme {
        sqlx::query("UPDATE users SET theme = $1, updated_at = NOW() WHERE id = $2")
            .bind(theme)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(serde_json::json!({ "success": true })))
}
