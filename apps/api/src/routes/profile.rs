use axum::{extract::State, routing::patch, Json, Router};
use serde::Deserialize;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/profile", patch(update_profile))
        .route("/profile/preferences", patch(update_preferences))
}

#[derive(Deserialize)]
struct ProfileUpdate {
    name: Option<String>,
    bio: Option<String>,
}

async fn update_profile(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<ProfileUpdate>,
) -> Result<Json<serde_json::Value>, AppError> {
    if let Some(ref name) = body.name {
        let trimmed = name.trim();
        if trimmed.len() < 2 {
            return Err(AppError::bad_request("Name must be at least 2 characters"));
        }
        if trimmed.len() > 100 {
            return Err(AppError::bad_request("Name must be at most 100 characters"));
        }
        sqlx::query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2")
            .bind(trimmed)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref bio) = body.bio {
        let trimmed = if bio.trim().is_empty() {
            None
        } else {
            let t = bio.trim();
            if t.len() > 500 {
                return Err(AppError::bad_request("Bio must be at most 500 characters"));
            }
            Some(t.to_string())
        };
        sqlx::query("UPDATE users SET bio = $1, updated_at = NOW() WHERE id = $2")
            .bind(trimmed)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
    }
    Ok(Json(serde_json::json!({ "success": true })))
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
