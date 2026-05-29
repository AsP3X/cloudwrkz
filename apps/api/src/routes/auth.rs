//! Email/password auth: queued login/register with 202 + polling, logout, password change, session extension.

// Human: Login and register always enqueue async jobs (202 + poll) so credential checks and inserts can retry transient DB errors without blocking the HTTP thread.
// Agent: router login/register + status routes; spawn_login_retry spawn_register_retry; logout/change-password/extend-session mutate sessions + audit.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::Utc;
use sqlx::Row;
use tracing::{info, warn};

use crate::audit::{self, WriteAuditParams};
use crate::auth::device_identity::{
    ClientDeviceReport, client_hints_from_headers, resolve_device_identity,
};
use crate::auth::session_activity::{
    SessionPolicy, compute_activity_extension, invalidate_if_absolute_expired,
    initial_expires_at,
};
use crate::auth::extractors::{AuthUser, extract_token_from_headers};
use crate::auth::login_queue::{LoginJobStatusResponse, PendingLoginPayload, spawn_login_retry};
use crate::job_queue::JobLogger;
use crate::auth::password::{hash_password, verify_password};
use crate::auth::register_queue::{
    PendingRegisterPayload, RegisterJobStatusResponse, new_job_id, spawn_register_retry,
};
use crate::auth::session::generate_token;
use crate::error::AppError;
use crate::models::user::*;
use crate::routes::AppState;

// Human: Auth routes are merged under `/api/v1` and wrapped by IP rate limiting in `routes::mod` for brute-force protection.
// Agent: Router POST login register logout change-password extend-session; GET login/status register/status job_id.

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

// Human: Audit rows prefer explicit body `user_agent` when mobile sends it, but fall back to the HTTP header for browser clients.
// Agent: READS audit::client_ip_from_headers; OR body user_agent with header User-Agent fallback.

fn audit_ip_and_agent(
    headers: &HeaderMap,
    body_user_agent: &Option<String>,
) -> (Option<String>, Option<String>) {
    let ip = audit::client_ip_from_headers(headers);
    let ua = body_user_agent.clone().or_else(|| {
        headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
    });
    (ip, ua)
}

// Human: `POST /auth/login` always responds `202 Accepted` with a `job_id` while `spawn_login_retry` completes password verification and session creation asynchronously.
// Agent: insert_auth_login_job best-effort; login_jobs.insert_pending; spawn_login_retry PendingLoginPayload; RETURNS LoginQueuedResponse JSON.

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<axum::response::Response, AppError> {
    let (ip, user_agent) = audit_ip_and_agent(&headers, &body.user_agent);
    let email = body.email.to_lowercase().trim().to_string();
    info!(event = "auth.login", path = "/auth/login", email = %email, "auth request");
    if email.is_empty() || body.password.is_empty() {
        warn!(
            event = "auth.login.fail",
            path = "/auth/login",
            "invalid email or password (empty)"
        );
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

    let job_id = new_job_id();
    if let Err(e) =
        crate::auth::bg_job_record::insert_auth_login_job(&state.pool, &job_id, &email).await
    {
        warn!(
            event = "auth.bg_job.insert_login_failed",
            job_id = %job_id,
            error = %e,
            "background_jobs mirror insert failed (login still queued in memory)"
        );
    }
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
            client_hints: client_hints_from_headers(&headers),
            session_policy: SessionPolicy::from_config(&state.config),
        },
        JobLogger::new(state.job_worker_supervisor.job_logs(), state.pool.clone(), &job_id),
    );
    info!(
        event = "auth.login.queued",
        path = "/auth/login",
        email = %email,
        job_id = %job_id,
        "login job accepted (async processing)"
    );
    let queued = LoginQueuedResponse {
        message: "Sign-in is processing in the background (including automatic retries if the database was briefly unavailable). Poll GET /auth/login/status/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: 30,
    };
    Ok((StatusCode::ACCEPTED, Json(queued)).into_response())
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

    let job_id = new_job_id();
    if let Err(e) =
        crate::auth::bg_job_record::insert_auth_register_job(&state.pool, &job_id, &email, &name)
            .await
    {
        warn!(
            event = "auth.bg_job.insert_register_failed",
            job_id = %job_id,
            error = %e,
            "background_jobs mirror insert failed (registration still queued in memory)"
        );
    }
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
        JobLogger::new(state.job_worker_supervisor.job_logs(), state.pool.clone(), &job_id),
    );
    info!(
        event = "auth.register.queued",
        path = "/auth/register",
        email = %email,
        job_id = %job_id,
        "registration job accepted (async processing)"
    );
    Ok((
        StatusCode::ACCEPTED,
        Json(RegisterResponse {
            message: "Registration is processing in the background (including automatic retries if the database was briefly unavailable). Poll GET /auth/register/status/{job_id} until status is completed."
                .into(),
            user_id: None,
            email: None,
            queued: Some(true),
            job_id: Some(job_id),
            retry_deadline_secs: Some(30),
        }),
    ))
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
        let user_id: Option<String> =
            sqlx::query_scalar("SELECT user_id FROM sessions WHERE token = $1")
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
    headers: HeaderMap,
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

    let bearer = extract_token_from_headers(&headers)
        .ok_or_else(|| AppError::unauthorized("Missing token"))?;

    let prev = sqlx::query(
        r#"SELECT device_name, device_type, device_os, device_browser, user_agent, ip_address
           FROM sessions WHERE token = $1 AND user_id = $2"#,
    )
    .bind(&bearer)
    .bind(&user.id)
    .fetch_optional(&state.pool)
    .await?;

    let (mut device_name, mut device_type, mut device_os, mut device_browser, mut user_agent, mut ip_address) =
        if let Some(ref row) = prev {
            (
                row.try_get::<Option<String>, _>("device_name")
                    .ok()
                    .flatten(),
                row.try_get::<Option<String>, _>("device_type")
                    .ok()
                    .flatten(),
                row.try_get::<Option<String>, _>("device_os").ok().flatten(),
                row.try_get::<Option<String>, _>("device_browser")
                    .ok()
                    .flatten(),
                row.try_get::<Option<String>, _>("user_agent")
                    .ok()
                    .flatten(),
                row.try_get::<Option<String>, _>("ip_address")
                    .ok()
                    .flatten(),
            )
        } else {
            (None, None, None, None, None, None)
        };

    let header_ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let hints = client_hints_from_headers(&headers);
    let resolved = resolve_device_identity(
        user_agent.as_deref().or(header_ua.as_deref()),
        &ClientDeviceReport::default(),
        &hints,
    );
    device_name = device_name.or(resolved.device_name);
    device_type = device_type.or(resolved.device_type);
    device_os = device_os.or(resolved.device_os);
    device_browser = device_browser.or(resolved.device_browser);
    user_agent = user_agent.or(header_ua);
    if ip_address.is_none() {
        ip_address = audit::client_ip_from_headers(&headers);
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

    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(&user.id)
        .execute(&state.pool)
        .await?;

    let new_token = generate_token();
    let session_id = crate::id::new_cuid();
    let policy = SessionPolicy::from_config(&state.config);
    let expires_at = initial_expires_at(
        Utc::now().naive_utc(),
        state.config.session_max_age_secs,
        &policy,
    );

    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at,
                                  device_name, device_type, device_os, device_browser, user_agent, ip_address)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10)"#,
    )
    .bind(&session_id)
    .bind(&new_token)
    .bind(&user.id)
    .bind(expires_at)
    .bind(&device_name)
    .bind(&device_type)
    .bind(&device_os)
    .bind(&device_browser)
    .bind(&user_agent)
    .bind(&ip_address)
    .execute(&state.pool)
    .await?;

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id.clone()),
            action: "auth.password.change".into(),
            resource_type: Some("user".into()),
            resource_id: Some(user.id),
            context: Some(serde_json::json!({ "sessions_revoked": true })),
            ip_address: None,
            user_agent: None,
        },
    );

    Ok(Json(serde_json::json!({
        "message": "Password updated",
        "token": new_token,
    })))
}

async fn extend_session(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let token = crate::auth::extractors::extract_token_from_headers(&headers)
        .ok_or_else(|| AppError::unauthorized("Missing token"))?;
    let policy = SessionPolicy::from_config(&state.config);
    let now = Utc::now().naive_utc();

    let row = sqlx::query(
        r#"SELECT s.id, s.expires_at, s.created_at, s.user_id, u.status::text as status
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.token = $1"#,
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::unauthorized("Invalid session"))?;

    let expires_at: chrono::NaiveDateTime = row.get("expires_at");
    let created_at: chrono::NaiveDateTime = row.get("created_at");
    let session_id: String = row.get("id");
    let user_id: String = row.get("user_id");
    let status: String = row.get("status");

    if invalidate_if_absolute_expired(&state.pool, &session_id, created_at, &policy)
        .await
        .map_err(|_| AppError::internal("Failed to validate session"))?
    {
        return Err(AppError::unauthorized("Session expired"));
    }

    if expires_at < now {
        return Err(AppError::unauthorized("Session expired"));
    }
    if status != "ACTIVE" {
        return Err(AppError::unauthorized("Account not active"));
    }

    let Some(new_expires) = compute_activity_extension(now, created_at, expires_at, &policy) else {
        return Ok(Json(serde_json::json!({ "extended": false })));
    };

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let hints = client_hints_from_headers(&headers);
    let device = resolve_device_identity(
        user_agent.as_deref(),
        &ClientDeviceReport::default(),
        &hints,
    );

    sqlx::query(
        r#"UPDATE sessions SET expires_at = $1,
                              user_agent = COALESCE($3, user_agent),
                              device_name = COALESCE($4, device_name),
                              device_type = COALESCE($5, device_type),
                              device_os = COALESCE($6, device_os),
                              device_browser = COALESCE($7, device_browser),
                              updated_at = NOW()
           WHERE id = $2"#,
    )
    .bind(new_expires)
    .bind(&session_id)
    .bind(&user_agent)
    .bind(&device.device_name)
    .bind(&device.device_type)
    .bind(&device.device_os)
    .bind(&device.device_browser)
    .execute(&state.pool)
    .await?;

    audit::write_audit_from_headers(
        &state.pool,
        Some(user_id),
        "auth.session.extend",
        Some("session"),
        Some(session_id),
        Some(serde_json::json!({ "extended": true })),
        &headers,
    );

    Ok(Json(serde_json::json!({
        "extended": true,
        "expiresAt": new_expires.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    })))
}
