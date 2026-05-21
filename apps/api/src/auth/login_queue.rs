//! Async sign-in jobs for `POST /auth/login` (always returns 202 before touching the DB).
//!
//! The HTTP handler only enqueues; [`login_retry_loop`] runs [`attempt_login`] until success,
//! a final auth error (wrong password, banned, …), or the deadline. [`LoginAttemptError::Transient`]
//! (PostgreSQL/sqlx connection issues) is retried for up to [`LOGIN_RETRY_MAX`], so sign-in still
//! completes when the database was briefly unavailable at submit time.

// Human: Login returns 202 immediately while a tokio task retries `attempt_login` until success, a definitive auth error, or a short DB-outage window expires.
// Agent: HOLDS LoginJobs Mutex HashMap job status; CALLS attempt_login + finish_auth_login_job; CLASSIFIES LoginAttemptError Transient vs Final; SPAWNS spawn_login_retry.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::http::StatusCode;
use chrono::Utc;
use serde::Serialize;
use sqlx::{PgPool, Row};
use tracing::{info, warn};

use crate::audit::{self, WriteAuditParams};
use crate::auth::bg_job_record::finish_auth_login_job;
use crate::auth::device_identity::{
    ClientDeviceReport, ClientHintHeaders, is_native_app_session, resolve_device_identity,
};
use crate::auth::session_activity::{SessionPolicy, initial_expires_at};
use crate::auth::password::verify_password;
use crate::auth::session::generate_token;
use crate::db::is_transient_sqlx;
use crate::error::AppError;
use crate::models::user::{LoginRequest, LoginResponse, LoginUserInfo};

/// Wall-clock time the API will keep retrying a queued login.
pub const LOGIN_RETRY_MAX: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LoginJobStatusKind {
    Pending,
    Completed,
    Failed,
}

#[derive(Debug, Serialize)]
pub struct LoginJobStatusResponse {
    pub status: LoginJobStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<LoginUserInfo>,
    /// For clients that need special handling (e.g. redirect to banned page).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_hint: Option<String>,
}

#[derive(Clone, Default)]
pub struct LoginJobs(Arc<Mutex<HashMap<String, LoginJobRecord>>>);

struct LoginJobRecord {
    status: LoginJobState,
    created_at: Instant,
}

enum LoginJobState {
    Pending,
    Done(LoginJobStatusKind, LoginJobOutcome),
}

struct LoginJobOutcome {
    message: Option<String>,
    token: Option<String>,
    user: Option<LoginUserInfo>,
    client_hint: Option<String>,
}

#[derive(Clone)]
pub struct PendingLoginPayload {
    pub body: LoginRequest,
    pub email_normalized: String,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub client_hints: ClientHintHeaders,
    pub session_policy: SessionPolicy,
}

pub enum LoginAttemptError {
    Transient,
    Final(AppError),
}

// Human: Only connectivity-style sqlx errors are retried; everything else becomes a single internal error after logging.
// Agent: BRANCHES is_transient_sqlx; RETURNS Transient OR Final(internal) after warn auth.login.db_error.

fn map_sqlx_login(err: sqlx::Error) -> LoginAttemptError {
    if is_transient_sqlx(&err) {
        return LoginAttemptError::Transient;
    }
    warn!(
        event = "auth.login.db_error",
        "non-transient sqlx error: {:?}", err
    );
    LoginAttemptError::Final(AppError::internal("A database error occurred"))
}

fn failure_hint(err: &AppError) -> Option<String> {
    if err.code == "FORBIDDEN" {
        if err.message.to_lowercase().contains("banned") {
            return Some("BANNED".into());
        }
        if err.message.to_lowercase().contains("suspended") {
            return Some("SUSPENDED".into());
        }
    }
    None
}

// Human: Web clients now send device metadata on every login, so only native Cloudwrkz apps get the 7-day app TTL—not every browser with a parsed OS string.
// Agent: is_native_app_session ONLY; remember_me→30d; default web→24h; native app→7d.

fn login_initial_session_secs(
    body: &LoginRequest,
    device: &crate::auth::device_identity::DeviceIdentity,
    user_agent: Option<&str>,
) -> i64 {
    if is_native_app_session(device, user_agent) {
        7 * 24 * 60 * 60
    } else if body.remember_me {
        30 * 24 * 60 * 60
    } else {
        24 * 60 * 60
    }
}

/// Full sign-in attempt (used by the background login job after `POST /auth/login` returns 202).
// Human: This is the synchronous password check, session insert, and audit write—the same rules the old inline login used, just callable from the retry loop.
// Agent: SELECT users by email; verify_password; REJECTS wrong password inactive unverified banned suspended; INSERT sessions; WRITES audit auth.login; RETURNS LoginResponse.

pub async fn attempt_login(
    pool: &PgPool,
    body: &LoginRequest,
    email_normalized: &str,
    ip: Option<String>,
    user_agent: Option<String>,
    client_hints: &ClientHintHeaders,
    session_policy: &SessionPolicy,
) -> Result<LoginResponse, LoginAttemptError> {
    let email = email_normalized.to_string();

    let user = sqlx::query(
        r#"SELECT id, email, name, password, role::text as role, status::text as status,
                  email_verified
           FROM users WHERE email = $1 OR original_email = $1 LIMIT 1"#,
    )
    .bind(&email)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx_login)?
    .ok_or_else(|| {
        warn!(event = "auth.login.fail", email = %email, "user not found");
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: None,
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "user_not_found" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        LoginAttemptError::Final(AppError::unauthorized("Invalid email or password"))
    })?;

    let user_id: String = user.get("id");
    let user_email: String = user.get("email");
    let user_name: Option<String> = user.get("name");
    let user_password: String = user.get("password");
    let status: String = user.get("status");
    let email_verified: bool = user.get("email_verified");

    if status == "DELETED" {
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "deleted_account" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(LoginAttemptError::Final(AppError::unauthorized(
            "This account has been deleted. Please contact an administrator.",
        )));
    }

    let password = body.password.clone();
    let hash = user_password.clone();
    let valid = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .map_err(|_| LoginAttemptError::Final(AppError::internal("Password verification failed")))?
        .map_err(|_| {
            LoginAttemptError::Final(AppError::internal("Password verification failed"))
        })?;

    if !valid {
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "invalid_password" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(LoginAttemptError::Final(AppError::unauthorized(
            "Invalid email or password",
        )));
    }

    // Keep login/session behavior consistent with AuthUser extractor used by /me:
    // only ACTIVE + verified accounts can establish a usable session.
    if status != "ACTIVE" || !email_verified {
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({
                    "outcome": "inactive_or_unverified",
                    "status": status,
                    "email_verified": email_verified,
                })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(LoginAttemptError::Final(AppError::unauthorized(
            "Account not active. Please complete verification or contact support.",
        )));
    }

    if status == "BANNED" {
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "banned" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(LoginAttemptError::Final(AppError {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN".into(),
            message: "This account has been banned.".into(),
            fields: None,
            transient_database: false,
        }));
    }
    if status == "SUSPENDED" {
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.login.attempt".into(),
                resource_type: None,
                resource_id: None,
                context: Some(serde_json::json!({ "outcome": "suspended" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(LoginAttemptError::Final(AppError {
            status: StatusCode::FORBIDDEN,
            code: "FORBIDDEN".into(),
            message: "Your account has been suspended. Please contact support.".into(),
            fields: None,
            transient_database: false,
        }));
    }

    sqlx::query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1")
        .bind(&user_id)
        .execute(pool)
        .await
        .map_err(map_sqlx_login)?;

    let token = generate_token();
    let client_report = ClientDeviceReport::from_login_body(body);
    let stored_user_agent = body
        .user_agent
        .clone()
        .or_else(|| user_agent.clone())
        .filter(|s| !s.trim().is_empty());
    let device = resolve_device_identity(
        stored_user_agent.as_deref(),
        &client_report,
        client_hints,
    );
    let session_secs = login_initial_session_secs(body, &device, stored_user_agent.as_deref());
    let now = Utc::now().naive_utc();
    let expires_at = initial_expires_at(now, session_secs, session_policy);
    let session_id = crate::id::new_cuid();

    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at,
                                  device_name, device_type, device_os, device_browser, user_agent, ip_address)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9, $10)"#,
    )
    .bind(&session_id)
    .bind(&token)
    .bind(&user_id)
    .bind(expires_at)
    .bind(&device.device_name)
    .bind(&device.device_type)
    .bind(&device.device_os)
    .bind(&device.device_browser)
    .bind(&stored_user_agent)
    .bind(&ip)
    .execute(pool)
    .await
    .map_err(map_sqlx_login)?;

    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id),
            action: "auth.login".into(),
            resource_type: None,
            resource_id: None,
            context: None,
            ip_address: ip,
            user_agent: stored_user_agent,
        },
    );

    Ok(LoginResponse {
        token,
        user: LoginUserInfo {
            name: user_name,
            email: user_email,
        },
    })
}

// Human: The in-process map mirrors job status for polling endpoints while pruning old completed rows so memory stays bounded.
// Agent: Mutex<HashMap<String, LoginJobRecord>>; prune_stale_login_jobs_locked removes Done older than 15m; get_status READS Pending/Done.

impl LoginJobs {
    pub fn insert_pending(&self, job_id: &str) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        prune_stale_login_jobs_locked(&mut map);
        map.insert(
            job_id.to_string(),
            LoginJobRecord {
                status: LoginJobState::Pending,
                created_at: Instant::now(),
            },
        );
    }

    pub fn set_completed(&self, job_id: &str, response: LoginResponse) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(rec) = map.get_mut(job_id) {
            rec.status = LoginJobState::Done(
                LoginJobStatusKind::Completed,
                LoginJobOutcome {
                    message: None,
                    token: Some(response.token),
                    user: Some(response.user),
                    client_hint: None,
                },
            );
        }
    }

    pub fn set_failed(&self, job_id: &str, message: String, client_hint: Option<String>) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(rec) = map.get_mut(job_id) {
            rec.status = LoginJobState::Done(
                LoginJobStatusKind::Failed,
                LoginJobOutcome {
                    message: Some(message),
                    token: None,
                    user: None,
                    client_hint,
                },
            );
        }
    }

    pub fn get_status(&self, job_id: &str) -> Option<LoginJobStatusResponse> {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        prune_stale_login_jobs_locked(&mut map);
        let rec = map.get(job_id)?;
        match &rec.status {
            LoginJobState::Pending => Some(LoginJobStatusResponse {
                status: LoginJobStatusKind::Pending,
                message: None,
                token: None,
                user: None,
                client_hint: None,
            }),
            LoginJobState::Done(kind, out) => Some(LoginJobStatusResponse {
                status: kind.clone(),
                message: out.message.clone(),
                token: out.token.clone(),
                user: out.user.clone(),
                client_hint: out.client_hint.clone(),
            }),
        }
    }
}

fn prune_stale_login_jobs_locked(map: &mut HashMap<String, LoginJobRecord>) {
    let cutoff = match Instant::now().checked_sub(Duration::from_secs(15 * 60)) {
        Some(c) => c,
        None => return,
    };
    map.retain(|_, rec| {
        if let LoginJobState::Done(_, _) = rec.status {
            rec.created_at > cutoff
        } else {
            true
        }
    });
}

// Human: Handlers detach login work with `tokio::spawn` so the HTTP task returns 202 immediately while retries continue in the background.
// Agent: SPAWNS async login_retry_loop(pool, jobs, job_id, payload); NO JoinHandle returned to caller.

pub fn spawn_login_retry(
    pool: PgPool,
    jobs: LoginJobs,
    job_id: String,
    payload: PendingLoginPayload,
) {
    tokio::spawn(async move {
        login_retry_loop(pool, jobs, job_id, payload).await;
    });
}

// Human: The retry loop backs off implicitly by re-running `attempt_login` on each iteration until the wall clock hits `LOGIN_RETRY_MAX`.
// Agent: LOOP until deadline; ON Ok set_completed + finish_auth_login_job success; ON Final set_failed + finish failed; ON Transient sleep 200ms; TIMEOUT sets failed message.

async fn login_retry_loop(
    pool: PgPool,
    jobs: LoginJobs,
    job_id: String,
    payload: PendingLoginPayload,
) {
    let deadline = tokio::time::Instant::now() + LOGIN_RETRY_MAX;
    let email = payload.email_normalized.clone();

    loop {
        if tokio::time::Instant::now() >= deadline {
            warn!(
                event = "auth.login.queue_timeout",
                job_id = %job_id,
                email = %email,
                "login job timed out waiting for database"
            );
            let msg = "The database did not become available in time. Please try signing in again.";
            jobs.set_failed(&job_id, msg.into(), None);
            finish_auth_login_job(&pool, &job_id, false, Some(msg)).await;
            break;
        }

        match attempt_login(
            &pool,
            &payload.body,
            &payload.email_normalized,
            payload.ip.clone(),
            payload.user_agent.clone(),
            &payload.client_hints,
            &payload.session_policy,
        )
        .await
        {
            Ok(response) => {
                info!(
                    event = "auth.login.queue_success",
                    job_id = %job_id,
                    email = %response.user.email,
                    "queued login completed"
                );
                jobs.set_completed(&job_id, response);
                finish_auth_login_job(&pool, &job_id, true, None).await;
                break;
            }
            Err(LoginAttemptError::Transient) => {
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
            Err(LoginAttemptError::Final(e)) => {
                let hint = failure_hint(&e);
                let msg = e.message.clone();
                jobs.set_failed(&job_id, msg.clone(), hint);
                finish_auth_login_job(&pool, &job_id, false, Some(msg.as_str())).await;
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::device_identity::DeviceIdentity;

    #[test]
    fn web_remember_me_with_device_metadata_gets_thirty_days() {
        let body = LoginRequest {
            email: "a@b.c".into(),
            password: "x".into(),
            remember_me: true,
            device_name: Some("macOS · Chrome".into()),
            device_type: Some("desktop".into()),
            device_os: Some("macOS".into()),
            device_browser: Some("Chrome".into()),
            user_agent: Some("Mozilla/5.0 Chrome/131".into()),
        };
        let device = DeviceIdentity {
            device_name: body.device_name.clone(),
            device_type: body.device_type.clone(),
            device_os: body.device_os.clone(),
            device_browser: body.device_browser.clone(),
        };
        assert_eq!(
            login_initial_session_secs(&body, &device, body.user_agent.as_deref()),
            30 * 24 * 60 * 60
        );
    }

    #[test]
    fn web_without_remember_me_gets_twenty_four_hours() {
        let body = LoginRequest {
            email: "a@b.c".into(),
            password: "x".into(),
            remember_me: false,
            device_name: Some("macOS · Chrome".into()),
            device_type: Some("desktop".into()),
            device_os: Some("macOS".into()),
            device_browser: Some("Chrome".into()),
            user_agent: Some("Mozilla/5.0 Chrome/131".into()),
        };
        let device = DeviceIdentity {
            device_name: body.device_name.clone(),
            device_type: body.device_type.clone(),
            device_os: body.device_os.clone(),
            device_browser: body.device_browser.clone(),
        };
        assert_eq!(
            login_initial_session_secs(&body, &device, body.user_agent.as_deref()),
            24 * 60 * 60
        );
    }

    #[test]
    fn native_app_gets_seven_days_even_with_remember_me() {
        let body = LoginRequest {
            email: "a@b.c".into(),
            password: "x".into(),
            remember_me: true,
            device_name: Some("Mobile iOS (Cloudwrkz App)".into()),
            device_type: Some("mobile".into()),
            device_os: Some("iOS".into()),
            device_browser: Some("Cloudwrkz App".into()),
            user_agent: Some("Cloudwrkz-iOS/1.0 (1; iOS 17.0; iPhone15,2)".into()),
        };
        let device = DeviceIdentity {
            device_name: body.device_name.clone(),
            device_type: body.device_type.clone(),
            device_os: body.device_os.clone(),
            device_browser: body.device_browser.clone(),
        };
        assert_eq!(
            login_initial_session_secs(&body, &device, body.user_agent.as_deref()),
            7 * 24 * 60 * 60
        );
    }
}
