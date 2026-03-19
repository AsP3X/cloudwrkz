//! Async registration jobs for `POST /auth/register` (always returns 202 before INSERT).
//!
//! The handler only enqueues a hashed password payload; [`register_retry_loop`] runs
//! [`attempt_register_user`] until success, conflict, fatal error, or the deadline. Transient
//! database errors retry for up to [`REGISTER_RETRY_MAX`], same as when the DB was only briefly down.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::audit::{self, WriteAuditParams};
use crate::db::is_transient_sqlx;

/// Wall-clock time the API will keep retrying a queued registration.
pub const REGISTER_RETRY_MAX: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RegisterJobStatusKind {
    Pending,
    Completed,
    Failed,
}

#[derive(Debug, Serialize)]
pub struct RegisterJobStatusResponse {
    pub status: RegisterJobStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Clone, Default)]
pub struct RegisterJobs(Arc<Mutex<HashMap<String, JobRecord>>>);

struct JobRecord {
    status: JobStatus,
    created_at: Instant,
}

enum JobStatus {
    Pending,
    Done(RegisterJobStatusKind, Option<String>, Option<String>, Option<String>),
}

#[derive(Clone)]
pub struct PendingRegisterPayload {
    pub email: String,
    pub name: String,
    pub password_hash: String,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
}

pub enum RegisterAttemptError {
    Transient,
    Conflict(String),
    Fatal(String),
}

impl RegisterJobs {
    pub fn insert_pending(&self, job_id: &str) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        prune_stale_jobs_locked(&mut map);
        map.insert(
            job_id.to_string(),
            JobRecord {
                status: JobStatus::Pending,
                created_at: Instant::now(),
            },
        );
    }

    pub fn set_outcome(
        &self,
        job_id: &str,
        kind: RegisterJobStatusKind,
        message: Option<String>,
        user_id: Option<String>,
        email: Option<String>,
    ) {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(rec) = map.get_mut(job_id) {
            rec.status = JobStatus::Done(kind, message, user_id, email);
        }
    }

    pub fn get_status(&self, job_id: &str) -> Option<RegisterJobStatusResponse> {
        let mut map = self.0.lock().unwrap_or_else(|e| e.into_inner());
        prune_stale_jobs_locked(&mut map);
        let rec = map.get(job_id)?;
        match &rec.status {
            JobStatus::Pending => Some(RegisterJobStatusResponse {
                status: RegisterJobStatusKind::Pending,
                message: None,
                user_id: None,
                email: None,
            }),
            JobStatus::Done(kind, msg, uid, em) => Some(RegisterJobStatusResponse {
                status: kind.clone(),
                message: msg.clone(),
                user_id: uid.clone(),
                email: em.clone(),
            }),
        }
    }
}

/// Remove terminal jobs older than 15 minutes to bound memory.
fn prune_stale_jobs_locked(map: &mut HashMap<String, JobRecord>) {
    let cutoff = match Instant::now().checked_sub(Duration::from_secs(15 * 60)) {
        Some(c) => c,
        None => return,
    };
    map.retain(|_, rec| {
        if let JobStatus::Done(_, _, _, _) = rec.status {
            rec.created_at > cutoff
        } else {
            true
        }
    });
}

fn classify_sqlx(err: sqlx::Error) -> RegisterAttemptError {
    if is_transient_sqlx(&err) {
        return RegisterAttemptError::Transient;
    }
    if let sqlx::Error::Database(ref db) = err {
        if db.code().as_deref() == Some("23505") {
            return RegisterAttemptError::Conflict(
                "An account with this email already exists".into(),
            );
        }
    }
    RegisterAttemptError::Fatal(err.to_string())
}

/// One attempt to create a user row (duplicate check, insert, audit trigger).
pub async fn attempt_register_user(
    pool: &PgPool,
    email: &str,
    name: &str,
    password_hash: &str,
    ip: Option<String>,
    user_agent: Option<String>,
) -> Result<(String, String), RegisterAttemptError> {
    let existing: Option<String> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
        .map_err(|e| classify_sqlx(e))?;

    if existing.is_some() {
        return Err(RegisterAttemptError::Conflict(
            "An account with this email already exists".into(),
        ));
    }

    let user_id = crate::id::new_cuid();

    sqlx::query(
        r#"INSERT INTO users (id, email, name, password, role, status, email_verified,
                              timezone, theme, locale, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'USER', 'PENDING', false, 'UTC', 'system', 'en', NOW(), NOW())"#,
    )
    .bind(&user_id)
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .execute(pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
            RegisterAttemptError::Conflict("An account with this email already exists".into())
        }
        _ => classify_sqlx(e),
    })?;

    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "auth.register".into(),
            resource_type: Some("user".into()),
            resource_id: Some(user_id.clone()),
            context: None,
            ip_address: ip,
            user_agent,
        },
    );

    Ok((user_id, email.to_string()))
}

pub fn spawn_register_retry(
    pool: PgPool,
    jobs: RegisterJobs,
    job_id: String,
    payload: PendingRegisterPayload,
) {
    let jid = job_id.clone();
    tokio::spawn(async move {
        register_retry_loop(pool, jobs, jid, payload).await;
    });
}

async fn register_retry_loop(
    pool: PgPool,
    jobs: RegisterJobs,
    job_id: String,
    payload: PendingRegisterPayload,
) {
    let deadline = tokio::time::Instant::now() + REGISTER_RETRY_MAX;
    let email = payload.email.clone();

    loop {
        if tokio::time::Instant::now() >= deadline {
            warn!(
                event = "auth.register.queue_timeout",
                job_id = %job_id,
                email = %email,
                "registration job timed out waiting for database"
            );
            jobs.set_outcome(
                &job_id,
                RegisterJobStatusKind::Failed,
                Some(
                    "The database did not become available in time. Please try registering again."
                        .into(),
                ),
                None,
                None,
            );
            break;
        }

        match attempt_register_user(
            &pool,
            &payload.email,
            &payload.name,
            &payload.password_hash,
            payload.ip.clone(),
            payload.user_agent.clone(),
        )
        .await
        {
            Ok((user_id, em)) => {
                info!(
                    event = "auth.register.queue_success",
                    job_id = %job_id,
                    user_id = %user_id,
                    email = %em,
                    "queued registration completed"
                );
                jobs.set_outcome(
                    &job_id,
                    RegisterJobStatusKind::Completed,
                    Some("Account created successfully.".into()),
                    Some(user_id),
                    Some(em),
                );
                break;
            }
            Err(RegisterAttemptError::Transient) => {
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
            Err(RegisterAttemptError::Conflict(msg)) => {
                jobs.set_outcome(
                    &job_id,
                    RegisterJobStatusKind::Failed,
                    Some(msg),
                    None,
                    None,
                );
                break;
            }
            Err(RegisterAttemptError::Fatal(msg)) => {
                warn!(
                    event = "auth.register.queue_fatal",
                    job_id = %job_id,
                    email = %email,
                    "{}",
                    msg
                );
                jobs.set_outcome(
                    &job_id,
                    RegisterJobStatusKind::Failed,
                    Some("Registration failed. Please try again later.".into()),
                    None,
                    None,
                );
                break;
            }
        }
    }
}

pub fn new_job_id() -> String {
    Uuid::new_v4().to_string()
}
