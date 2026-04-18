//! Mirror `POST /auth/login` and `POST /auth/register` async work into `background_jobs` so admin
//! and operators see them alongside other queued work. Rows are inserted as `processing` (the
//! global worker only claims `pending`) and finalized by the auth retry loops.

use serde_json::json;
use sqlx::PgPool;
use tracing::warn;

use crate::job_queue::{JOB_TYPE_AUTH_LOGIN, JOB_TYPE_AUTH_REGISTER};

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
