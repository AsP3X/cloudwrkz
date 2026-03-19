use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use sqlx::Row;
use tracing::{info, warn};

use crate::audit::{self, WriteAuditParams};
use crate::auth::extractors::AuthUser;
use crate::auth::login_queue::{
    attempt_login, spawn_login_retry, LoginAttemptError, LoginJobStatusResponse, PendingLoginPayload,
};
use crate::auth::password::{hash_password, verify_password};
use crate::auth::register_queue::{
    attempt_register_user, new_job_id, spawn_register_retry, PendingRegisterPayload,
    RegisterAttemptError, RegisterJobStatusResponse,
};
use crate::error::AppError;
use crate::models::user::*;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/login/status/{job_id}", get(login_job_status))
        .route("/auth/register", post(register))
        .route("/auth/register/status/{job_id}", get(register_job_status))
        .route("/auth/logout", post(logout))
        .route("/auth/change-password", post(change_password))
        .route("/auth/extend-session", post(extend_session))
}

fn audit_ip_and_agent(headers: &HeaderMap, body_user_agent: &Option<String>) -> (Option<String>, Option<String>) {
    let ip = audit::client_ip_from_headers(headers);
    let ua = body_user_agent
        .clone()
        .or_else(|| {
            headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .map(String::from)
        });
    (ip, ua)
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<axum::response::Response, AppError> {
    let (ip, user_agent) = audit_ip_and_agent(&headers, &body.user_agent);
    let email = body.email.to_lowercase().trim().to_string();
    info!(event = "auth.login", path = "/auth/login", email = %email, "auth request");
    if email.is_empty() || body.password.is_empty() {
        warn!(event = "auth.login.fail", path = "/auth/login", "invalid email or password (empty)");
        audit::write_audit_log(
            &state.pool,
            WriteAuditParams {
                user_id: None,
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "empty_credentials" })),
                ip_address: ip,
                user_agent: user_agent.clone(),
            },
        );
        return Err(AppError::unauthorized("Invalid email or password"));
    }

    match attempt_login(&state.pool, &body, &email, ip.clone(), user_agent.clone()).await {
        Ok(response) => Ok((StatusCode::OK, Json(response)).into_response()),
        Err(LoginAttemptError::Transient) => {
            let job_id = new_job_id();
            state.login_jobs.insert_pending(&job_id);
            spawn_login_retry(
                state.pool.clone(),
                state.login_jobs.clone(),
                job_id.clone(),
                PendingLoginPayload {
                    body: body.clone(),
                    email_normalized: email.clone(),
                    ip,
                    user_agent,
                },
            );
            info!(
                event = "auth.login.queued",
                path = "/auth/login",
                email = %email,
                job_id = %job_id,
                "login queued: database temporarily unavailable"
            );
            let queued = LoginQueuedResponse {
                message: "Database is temporarily unavailable. Your sign-in has been queued by the API and will complete automatically within about 30 seconds. Poll GET /auth/login/status/{job_id} until status is completed."
                    .into(),
                queued: true,
                job_id,
                retry_deadline_secs: 30,
            };
            Ok((StatusCode::ACCEPTED, Json(queued)).into_response())
        }
        Err(LoginAttemptError::Final(e)) => Err(e),
    }
}

async fn login_job_status(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Json<LoginJobStatusResponse>, AppError> {
    state
        .login_jobs
        .get_status(&job_id)
        .map(Json)
        .ok_or_else(|| AppError::not_found("Unknown or expired login job"))
}

async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<RegisterResponse>), AppError> {
    let email = body.email.to_lowercase().trim().to_string();
    let name = body.name.trim().to_string();
    info!(event = "auth.register", path = "/auth/register", email = %email, name_len = name.len(), "auth request");

    if name.len() < 2 {
        warn!(event = "auth.register.validation", path = "/auth/register", email = %email, "validation: name too short");
        return Err(AppError::bad_request("Name must be at least 2 characters"));
    }
    if email.is_empty() || !email.contains('@') {
        warn!(event = "auth.register.validation", path = "/auth/register", email = %email, "validation: invalid email");
        return Err(AppError::bad_request("Invalid email address"));
    }
    if body.password.len() < 8 {
        warn!(event = "auth.register.validation", path = "/auth/register", email = %email, "validation: password too short");
        return Err(AppError::bad_request(
            "Password must be at least 8 characters",
        ));
    }
    if let Some(ref confirm) = body.confirm_password {
        if *confirm != body.password {
            warn!(event = "auth.register.validation", path = "/auth/register", email = %email, "validation: passwords do not match");
            return Err(AppError::validation(
                "Validation failed",
                serde_json::json!({ "password": ["Passwords do not match"] }),
            ));
        }
    }

    let (ip, user_agent) = audit_ip_and_agent(&headers, &None::<String>);

    let password = body.password.clone();
    let hashed = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(|e| {
            warn!(event = "auth.register.error", path = "/auth/register", email = %email, "hash task join error: {:?}", e);
            AppError::internal("Failed to hash password")
        })?
        .map_err(|_| {
            warn!(event = "auth.register.error", path = "/auth/register", email = %email, "password hash failed");
            AppError::internal("Failed to hash password")
        })?;

    match attempt_register_user(
        &state.pool,
        &email,
        &name,
        &hashed,
        ip.clone(),
        user_agent.clone(),
    )
    .await
    {
        Ok((user_id, em)) => {
            info!(event = "auth.register.success", path = "/auth/register", email = %em, user_id = %user_id, "register success");
            Ok((
                StatusCode::CREATED,
                Json(RegisterResponse {
                    message: "Account created successfully.".into(),
                    user_id: Some(user_id),
                    email: Some(em),
                    queued: None,
                    job_id: None,
                    retry_deadline_secs: None,
                }),
            ))
        }
        Err(RegisterAttemptError::Transient) => {
            let job_id = new_job_id();
            state.register_jobs.insert_pending(&job_id);
            spawn_register_retry(
                state.pool.clone(),
                state.register_jobs.clone(),
                job_id.clone(),
                PendingRegisterPayload {
                    email: email.clone(),
                    name: name.clone(),
                    password_hash: hashed,
                    ip,
                    user_agent,
                },
            );
            info!(
                event = "auth.register.queued",
                path = "/auth/register",
                email = %email,
                job_id = %job_id,
                "register queued: database temporarily unavailable"
            );
            Ok((
                StatusCode::ACCEPTED,
                Json(RegisterResponse {
                    message: "Database is temporarily unavailable. Your registration has been queued by the API and will complete automatically within about 30 seconds.".into(),
                    user_id: None,
                    email: None,
                    queued: Some(true),
                    job_id: Some(job_id),
                    retry_deadline_secs: Some(30),
                }),
            ))
        }
        Err(RegisterAttemptError::Conflict(msg)) => {
            warn!(event = "auth.register.conflict", path = "/auth/register", email = %email, "conflict: {}", msg);
            Err(AppError::conflict(msg))
        }
        Err(RegisterAttemptError::Fatal(msg)) => {
            warn!(event = "auth.register.error", path = "/auth/register", email = %email, "{}", msg);
            Err(AppError::internal("Registration failed. Please try again later."))
        }
    }
}

async fn register_job_status(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<Json<RegisterJobStatusResponse>, AppError> {
    state
        .register_jobs
        .get_status(&job_id)
        .map(Json)
        .ok_or_else(|| AppError::not_found("Unknown or expired registration job"))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let (ip, user_agent) = audit_ip_and_agent(&headers, &None::<String>);
    if let Some(token) = crate::auth::extractors::extract_token_from_headers(&headers) {
        let user_id: Option<String> = sqlx::query_scalar("SELECT user_id FROM sessions WHERE token = $1")
            .bind(&token)
            .fetch_optional(&state.pool)
            .await?;
        let _ = sqlx::query("DELETE FROM sessions WHERE token = $1")
            .bind(&token)
            .execute(&state.pool)
            .await;
        audit::write_audit_log(
            &state.pool,
            WriteAuditParams {
                user_id,
                action: "auth.logout".into(),
                resource_type: None,
                resource_id: None,
                context: None,
                ip_address: ip,
                user_agent,
            },
        );
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
            return Err(AppError::validation(
                "Validation failed",
                serde_json::json!({ "password": ["Passwords do not match"] }),
            ));
        }
    }

    let row: Option<UserRow> = sqlx::query_as(
        r#"SELECT id, email, name, password, role::text as role, status::text as status,
                  email_verified, timezone, theme, locale, avatar, bio,
                  last_login_at, last_login_ip, created_at, updated_at
           FROM users WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;

    let row = row.ok_or_else(|| AppError::not_found("User not found"))?;
    if row.status != "ACTIVE" {
        return Err(AppError::forbidden(
            "Your account is not active. Password cannot be changed.",
        ));
    }

    let db_hash = row.password.clone();
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

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id.clone()),
            action: "auth.password.change".into(),
            resource_type: Some("user".into()),
            resource_id: Some(user.id),
            context: None,
            ip_address: None,
            user_agent: None,
        },
    );

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
