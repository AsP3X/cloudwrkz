//! Mirror `POST /auth/login` and `POST /auth/register` async work into `background_jobs` so admin
//! and operators see them alongside other queued work. Rows are inserted as `processing` (the
//! global worker only claims `pending`) and finalized by the auth retry loops.

// Human: Auth login/register work is mirrored into `background_jobs` as `processing` so dashboards show in-flight auth without the global deque stealing those rows.
// Agent: INSERT background_jobs status processing + dedupe_key auth_*; finish_* UPDATE completed/failed with warn-only on sqlx Err.

use serde_json::json;
use sqlx::PgPool;
use tracing::warn;

use crate::job_queue::{JOB_TYPE_AUTH_LOGIN, JOB_TYPE_AUTH_REGISTER};

// Human: Each login attempt gets a stable `dedupe_key` so operators can correlate UI rows with the same logical login flow.
// Agent: INSERT JOB_TYPE_AUTH_LOGIN payload email kind login; BINDS dedupe_key auth_login:{job_id}; status processing.

pub async fn insert_auth_login_job(
    pool: &PgPool,
    job_id: &str,
    email: &str,
) -> Result<(), sqlx::Error> {
    let dedupe = format!("auth_login:{job_id}");
    let payload = json!({
        "email": email,
        "kind": "login",
    });
    sqlx::query(
        r#"INSERT INTO background_jobs (
             id, job_type, payload, status, dedupe_key,
             created_at, updated_at, started_at
           )
           VALUES ($1, $2, $3, 'processing', $4, NOW(), NOW(), NOW())"#,
    )
    .bind(job_id)
    .bind(JOB_TYPE_AUTH_LOGIN)
    .bind(payload)
    .bind(&dedupe)
    .execute(pool)
    .await?;
    Ok(())
}

// Human: Registration jobs carry email and display name in JSON so the admin job list shows enough context without joining users yet.
// Agent: INSERT JOB_TYPE_AUTH_REGISTER payload email name kind register; dedupe_key auth_register:{job_id}.

pub async fn insert_auth_register_job(
    pool: &PgPool,
    job_id: &str,
    email: &str,
    name: &str,
) -> Result<(), sqlx::Error> {
    let dedupe = format!("auth_register:{job_id}");
    let payload = json!({
        "email": email,
        "name": name,
        "kind": "register",
    });
    sqlx::query(
        r#"INSERT INTO background_jobs (
             id, job_type, payload, status, dedupe_key,
             created_at, updated_at, started_at
           )
           VALUES ($1, $2, $3, 'processing', $4, NOW(), NOW(), NOW())"#,
    )
    .bind(job_id)
    .bind(JOB_TYPE_AUTH_REGISTER)
    .bind(payload)
    .bind(&dedupe)
    .execute(pool)
    .await?;
    Ok(())
}

// Human: Completing the login row is best-effort: a failed UPDATE should not mask the real HTTP response the user already received.
// Agent: UPDATE background_jobs WHERE id AND job_type auth_login SET completed or failed + error_message; LOGS warn on Err.

pub async fn finish_auth_login_job(
    pool: &PgPool,
    job_id: &str,
    success: bool,
    error_message: Option<&str>,
) {
    let res = if success {
        sqlx::query(
            r#"UPDATE background_jobs
               SET status = 'completed',
                   error_message = NULL,
                   updated_at = clock_timestamp(),
                   completed_at = clock_timestamp()
               WHERE id = $1 AND job_type = $2"#,
        )
        .bind(job_id)
        .bind(JOB_TYPE_AUTH_LOGIN)
        .execute(pool)
        .await
    } else {
        sqlx::query(
            r#"UPDATE background_jobs
               SET status = 'failed',
                   error_message = $3,
                   updated_at = clock_timestamp(),
                   completed_at = clock_timestamp()
               WHERE id = $1 AND job_type = $2"#,
        )
        .bind(job_id)
        .bind(JOB_TYPE_AUTH_LOGIN)
        .bind(error_message.unwrap_or("Login failed"))
        .execute(pool)
        .await
    };
    if let Err(e) = res {
        warn!(
            event = "auth.bg_job.finish_login_failed",
            job_id = %job_id,
            error = %e,
            "could not update background_jobs for auth login"
        );
    }
}

// Human: Same semantics as login: register handlers always respond to the client even if the bookkeeping UPDATE fails afterward.
// Agent: UPDATE background_jobs JOB_TYPE_AUTH_REGISTER completed/failed; warn auth.bg_job.finish_register_failed on Err.

pub async fn finish_auth_register_job(
    pool: &PgPool,
    job_id: &str,
    success: bool,
    error_message: Option<&str>,
) {
    let res = if success {
        sqlx::query(
            r#"UPDATE background_jobs
               SET status = 'completed',
                   error_message = NULL,
                   updated_at = clock_timestamp(),
                   completed_at = clock_timestamp()
               WHERE id = $1 AND job_type = $2"#,
        )
        .bind(job_id)
        .bind(JOB_TYPE_AUTH_REGISTER)
        .execute(pool)
        .await
    } else {
        sqlx::query(
            r#"UPDATE background_jobs
               SET status = 'failed',
                   error_message = $3,
                   updated_at = clock_timestamp(),
                   completed_at = clock_timestamp()
               WHERE id = $1 AND job_type = $2"#,
        )
        .bind(job_id)
        .bind(JOB_TYPE_AUTH_REGISTER)
        .bind(error_message.unwrap_or("Registration failed"))
        .execute(pool)
        .await
    };
    if let Err(e) = res {
        warn!(
            event = "auth.bg_job.finish_register_failed",
            job_id = %job_id,
            error = %e,
            "could not update background_jobs for auth register"
        );
    }
}
