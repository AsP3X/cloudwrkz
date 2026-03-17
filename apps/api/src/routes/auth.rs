use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use chrono::Utc;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::auth::password::{hash_password, verify_password};
use crate::auth::session::generate_token;
use crate::error::AppError;
use crate::models::user::*;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/register", post(register))
        .route("/auth/logout", post(logout))
        .route("/auth/change-password", post(change_password))
        .route("/auth/extend-session", post(extend_session))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let email = body.email.to_lowercase().trim().to_string();
    if email.is_empty() || body.password.is_empty() {
        return Err(AppError::unauthorized("Invalid email or password"));
    }

    let user = sqlx::query(
        r#"SELECT id, email, name, password, role::text as role, status::text as status,
                  email_verified
           FROM users WHERE email = $1 OR original_email = $1 LIMIT 1"#,
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::unauthorized("Invalid email or password"))?;

    let user_id: String = user.get("id");
    let user_email: String = user.get("email");
    let user_name: Option<String> = user.get("name");
    let user_password: String = user.get("password");
    let status: String = user.get("status");

    if status == "DELETED" {
        return Err(AppError::unauthorized(
            "This account has been deleted. Please contact an administrator.",
        ));
    }

    let password = body.password.clone();
    let hash = user_password.clone();
    let valid = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .map_err(|_| AppError::internal("Password verification failed"))?
        .map_err(|_| AppError::internal("Password verification failed"))?;

    if !valid {
        return Err(AppError::unauthorized("Invalid email or password"));
    }

    if status == "BANNED" {
        return Err(AppError {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN".into(),
            message: "This account has been banned.".into(),
            fields: None,
        });
    }
    if status == "SUSPENDED" {
        return Err(AppError {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN".into(),
            message: "Your account has been suspended. Please contact support.".into(),
            fields: None,
        });
    }

    sqlx::query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1")
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    let token = generate_token();
    let is_app =
        body.device_type.is_some() || body.device_os.is_some() || body.device_name.is_some();
    let session_secs: i64 = if is_app {
        7 * 24 * 60 * 60
    } else if body.remember_me {
        30 * 24 * 60 * 60
    } else {
        24 * 60 * 60
    };
    let expires_at = Utc::now().naive_utc() + chrono::Duration::seconds(session_secs);
    let session_id = crate::id::new_cuid();

    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at,
                                  device_name, device_type, device_os, device_browser, user_agent)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9)"#,
    )
    .bind(&session_id)
    .bind(&token)
    .bind(&user_id)
    .bind(expires_at)
    .bind(&body.device_name)
    .bind(&body.device_type)
    .bind(&body.device_os)
    .bind(&body.device_browser)
    .bind(&body.user_agent)
    .execute(&state.pool)
    .await?;

    Ok(Json(LoginResponse {
        token,
        user: LoginUserInfo {
            name: user_name,
            email: user_email,
        },
    }))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<RegisterResponse>), AppError> {
    let email = body.email.to_lowercase().trim().to_string();
    let name = body.name.trim().to_string();

    if name.len() < 2 {
        return Err(AppError::bad_request("Name must be at least 2 characters"));
    }
    if email.is_empty() || !email.contains('@') {
        return Err(AppError::bad_request("Invalid email address"));
    }
    if body.password.len() < 8 {
        return Err(AppError::bad_request(
            "Password must be at least 8 characters",
        ));
    }
    if let Some(ref confirm) = body.confirm_password {
        if *confirm != body.password {
            return Err(AppError::bad_request("Passwords do not match"));
        }
    }

    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.pool)
            .await?;

    if existing.is_some() {
        return Err(AppError::conflict(
            "An account with this email already exists",
        ));
    }

    let password = body.password.clone();
    let hashed = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(|_| AppError::internal("Failed to hash password"))?
        .map_err(|_| AppError::internal("Failed to hash password"))?;

    let user_id = crate::id::new_cuid();

    sqlx::query(
        r#"INSERT INTO users (id, email, name, password, role, status, email_verified,
                              timezone, theme, locale, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'USER', 'ACTIVE', true, 'UTC', 'system', 'en', NOW(), NOW())"#,
    )
    .bind(&user_id)
    .bind(&email)
    .bind(&name)
    .bind(&hashed)
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(RegisterResponse {
            message: "Account created successfully.".into(),
            user_id: Some(user_id),
            email: Some(email),
        }),
    ))
}

async fn logout(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    if let Some(token) = crate::auth::extractors::extract_token_from_headers(&headers) {
        let _ = sqlx::query("DELETE FROM sessions WHERE token = $1")
            .bind(&token)
            .execute(&state.pool)
            .await;
    }
    Ok(Json(serde_json::json!({ "message": "Logged out" })))
}

async fn change_password(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if body.new_password.len() < 8 {
        return Err(AppError::bad_request(
            "New password must be at least 8 characters",
        ));
    }
    if let Some(ref confirm) = body.confirm_password {
        if *confirm != body.new_password {
            return Err(AppError::bad_request("Passwords do not match"));
        }
    }

    let row = sqlx::query("SELECT id, password, status::text as status FROM users WHERE id = $1")
        .bind(&user.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("User not found"))?;

    let db_status: String = row.get("status");
    if db_status != "ACTIVE" {
        return Err(AppError::forbidden(
            "Your account is not active. Password cannot be changed.",
        ));
    }

    let db_hash: String = row.get("password");
    let current = body.current_password.clone();
    let valid = tokio::task::spawn_blocking(move || verify_password(&current, &db_hash))
        .await
        .map_err(|_| AppError::internal("Password verification failed"))?
        .map_err(|_| AppError::internal("Password verification failed"))?;

    if !valid {
        return Err(AppError::unauthorized("Current password is incorrect"));
    }

    let new_pw = body.new_password.clone();
    let new_hash = tokio::task::spawn_blocking(move || hash_password(&new_pw))
        .await
        .map_err(|_| AppError::internal("Failed to hash password"))?
        .map_err(|_| AppError::internal("Failed to hash password"))?;

    sqlx::query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2")
        .bind(&new_hash)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Password updated" })))
}

async fn extend_session(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let token = crate::auth::extractors::extract_token_from_headers(&headers)
        .ok_or_else(|| AppError::unauthorized("Missing token"))?;

    let row = sqlx::query(
        r#"SELECT s.id, s.expires_at, u.status::text as status
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.token = $1"#,
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::unauthorized("Invalid session"))?;

    let expires_at: chrono::NaiveDateTime = row.get("expires_at");
    let session_id: String = row.get("id");
    let status: String = row.get("status");

    if expires_at < Utc::now().naive_utc() {
        return Err(AppError::unauthorized("Session expired"));
    }
    if status != "ACTIVE" {
        return Err(AppError::unauthorized("Account not active"));
    }

    let max_age = chrono::Duration::seconds(state.config.session_max_age_secs);
    let remaining = expires_at - Utc::now().naive_utc();
    if remaining >= max_age {
        return Ok(Json(serde_json::json!({ "extended": false })));
    }

    let new_expires = Utc::now().naive_utc() + max_age;
    sqlx::query("UPDATE sessions SET expires_at = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_expires)
        .bind(&session_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "extended": true })))
}
