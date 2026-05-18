//! First-run setup: create the initial admin when no users exist yet.

// Human: Empty installs expose public setup routes so the SPA wizard can create the first admin without the CLI.
// Agent: GET /setup/status READS users COUNT; POST /setup WRITES users ADMIN + all user_permissions + session; RETURNS LoginResponse; HTTP 409 when already initialized.

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use crate::audit::{self, WriteAuditParams};
use crate::auth::password::hash_password;
use crate::auth::session::generate_token;
use crate::error::AppError;
use crate::id::new_cuid;
use crate::models::user::{LoginResponse, LoginUserInfo};
use crate::routes::helpers::grant_all_permissions_to_user;
use crate::routes::AppState;

#[derive(Debug, Serialize)]
pub struct SetupStatus {
    pub setup_complete: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetupRequest {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub instance_name: Option<String>,
}

// Human: Lets the SPA decide whether to show `/setup` without probing protected routes.
// Agent: READS COUNT(*) FROM users; RETURNS setup_complete bool; NO AUTH.
pub async fn setup_status(State(state): State<AppState>) -> Result<Json<SetupStatus>, AppError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM users")
        .fetch_one(&state.pool)
        .await?;

    Ok(Json(SetupStatus {
        setup_complete: count > 0,
    }))
}

// Human: One-time admin bootstrap — mirrors `cloudwrkz-cli admin create-admin` but returns a session for immediate sign-in.
// Agent: REQUIRES users empty; INSERT users ADMIN ACTIVE; CALLS grant_all_permissions_to_user; OPTIONAL system_settings instance_name; INSERT sessions; RETURNS LoginResponse.
pub async fn setup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SetupRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM users")
        .fetch_one(&state.pool)
        .await?;
    if count > 0 {
        return Err(AppError {
            status: StatusCode::CONFLICT,
            code: "CONFLICT".into(),
            message: "setup already completed".into(),
            fields: None,
            transient_database: false,
        });
    }

    let email = body.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(AppError::bad_request("valid email is required"));
    }
    if body.password.len() < 8 {
        return Err(AppError::bad_request(
            "password must be at least 8 characters",
        ));
    }

    let name = body
        .name
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(String::from);

    let password_plain = body.password.clone();
    let password_hash = tokio::task::spawn_blocking(move || hash_password(&password_plain))
        .await
        .map_err(|_| AppError::internal("password hashing failed"))?
        .map_err(|_| AppError::internal("password hashing failed"))?;

    let user_id = new_cuid();
    let mut tx = state.pool.begin().await?;

    sqlx::query(
        r#"INSERT INTO users (id, email, name, password, role, status, email_verified,
                              timezone, theme, locale, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', true, 'UTC', 'system', 'en', NOW(), NOW())"#,
    )
    .bind(&user_id)
    .bind(&email)
    .bind(&name)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(db_err) = &e {
            if db_err.is_unique_violation() {
                return AppError {
                    status: StatusCode::CONFLICT,
                    code: "CONFLICT".into(),
                    message: "email already exists".into(),
                    fields: None,
                    transient_database: false,
                };
            }
        }
        AppError::from(e)
    })?;

    grant_all_permissions_to_user(&mut *tx, &user_id)
        .await
        .map_err(AppError::from)?;

    if let Some(instance_name) = body
        .instance_name
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        sqlx::query(
            r#"INSERT INTO system_settings (key, value, updated_at)
               VALUES ('instance_name', $1, NOW())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
        )
        .bind(serde_json::json!(instance_name))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let token = generate_token();
    let session_secs: i64 = 24 * 60 * 60;
    let expires_at = Utc::now().naive_utc() + chrono::Duration::seconds(session_secs);
    let session_id = new_cuid();

    let ip = audit::client_ip_from_headers(&headers);
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at, user_agent)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)"#,
    )
    .bind(&session_id)
    .bind(&token)
    .bind(&user_id)
    .bind(expires_at)
    .bind(&user_agent)
    .execute(&state.pool)
    .await?;

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "setup.complete".into(),
            resource_type: Some("users".into()),
            resource_id: Some(user_id),
            context: None,
            ip_address: ip,
            user_agent,
        },
    );

    Ok(Json(LoginResponse {
        token,
        user: LoginUserInfo {
            name,
            email,
        },
    }))
}

// Human: Mount setup routes on the public v1 router (no session required).
// Agent: GET /setup/status; POST /setup.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/setup/status", get(setup_status))
        .route("/setup", post(setup))
}
