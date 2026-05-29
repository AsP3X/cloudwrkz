//! Admin cancel / stop / restart for rows in `background_jobs`.

// Human: Operators can drop pending work, abort in-flight tasks, or requeue failed/cancelled/stuck jobs from the Jobs detail dialog.
// Agent: cancel_pending_job UPDATE pending→cancelled; stop_processing_job cancelled+abort; restart_job pending reset; REJECTS auth_login/auth_register.

use sqlx::{PgPool, Row};

use super::job_log::append_system_job_log_line;
use super::run_registry::JobRunRegistry;
use super::{JOB_TYPE_AUTH_LOGIN, JOB_TYPE_AUTH_REGISTER};

#[derive(Debug)]
pub enum JobControlError {
    NotFound,
    InvalidStatus {
        current: String,
        action: &'static str,
    },
    AuthJobNotControllable,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for JobControlError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value)
    }
}

impl JobControlError {
    pub fn into_app_error(self) -> crate::error::AppError {
        match self {
            Self::NotFound => crate::error::AppError::not_found("Job not found"),
            Self::InvalidStatus { current, action } => crate::error::AppError::bad_request(format!(
                "Cannot {action} a job with status '{current}'"
            )),
            Self::AuthJobNotControllable => crate::error::AppError::bad_request(
                "Auth login/register jobs are controlled by the auth queue, not the background job worker",
            ),
            Self::Database(e) => crate::error::AppError::internal(format!("background job control: {e}")),
        }
    }
}

fn is_auth_job_type(job_type: &str) -> bool {
    job_type == JOB_TYPE_AUTH_LOGIN || job_type == JOB_TYPE_AUTH_REGISTER
}

async fn load_job_status(pool: &PgPool, job_id: &str) -> Result<Option<(String, String)>, sqlx::Error> {
    let row = sqlx::query("SELECT status, job_type FROM background_jobs WHERE id = $1")
        .bind(job_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| (r.get("status"), r.get("job_type"))))
}

/// Remove a pending or stalling job from the queue without running it.
// Human: Queued rows become terminal `cancelled` so workers never claim them.
// Agent: UPDATE status cancelled WHERE pending|stalling; APPENDS processing_log line; ERR InvalidStatus if neither.

pub async fn cancel_pending_job(pool: &PgPool, job_id: &str) -> Result<(), JobControlError> {
    let Some((status, job_type)) = load_job_status(pool, job_id).await? else {
        return Err(JobControlError::NotFound);
    };
    if is_auth_job_type(&job_type) {
        return Err(JobControlError::AuthJobNotControllable);
    }
    if status != "pending" && status != super::JOB_STATUS_STALLING {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "cancel",
        });
    }

    let updated = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'cancelled',
               error_message = NULL,
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE id = $1 AND status IN ('pending', 'stalling')"#,
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "cancel",
        });
    }

    append_system_job_log_line(
        pool,
        job_id,
        &format!("Cancelled by administrator (was {status})"),
    )
    .await;
    Ok(())
}

/// Mark a running job cancelled and abort its worker task when still in this process.
// Human: Stop updates the DB first so completion handlers cannot overwrite `cancelled`, then aborts the tokio task if registered.
// Agent: UPDATE processing→cancelled; CALLS JobRunRegistry.abort; APPENDS log with aborted flag.

pub async fn stop_processing_job(
    pool: &PgPool,
    runs: &JobRunRegistry,
    job_id: &str,
) -> Result<bool, JobControlError> {
    let Some((status, job_type)) = load_job_status(pool, job_id).await? else {
        return Err(JobControlError::NotFound);
    };
    if is_auth_job_type(&job_type) {
        return Err(JobControlError::AuthJobNotControllable);
    }
    if status != "processing" {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "stop",
        });
    }

    let updated = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'cancelled',
               error_message = 'Stopped by administrator',
               updated_at = clock_timestamp(),
               completed_at = clock_timestamp()
           WHERE id = $1 AND status = 'processing'"#,
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "stop",
        });
    }

    let aborted = runs.abort(job_id);
    append_system_job_log_line(
        pool,
        job_id,
        &if aborted {
            "Stopped by administrator (worker task aborted)".to_string()
        } else {
            "Stopped by administrator (no in-process task handle; row marked cancelled)".to_string()
        },
    )
    .await;
    Ok(aborted)
}

/// Requeue a failed, cancelled, stalling, or stuck processing job so the worker runs it again.
// Human: Restart clears terminal/error state and returns the row to `pending`; processing jobs are stopped first when possible.
// Agent: MAY CALL stop_processing_job; UPDATE failed|cancelled|processing|stalling→pending clears started/completed/error; APPENDS log.

pub async fn restart_job(
    pool: &PgPool,
    runs: &JobRunRegistry,
    job_id: &str,
) -> Result<bool, JobControlError> {
    let Some((status, job_type)) = load_job_status(pool, job_id).await? else {
        return Err(JobControlError::NotFound);
    };
    if is_auth_job_type(&job_type) {
        return Err(JobControlError::AuthJobNotControllable);
    }
    if status == "completed" {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "restart",
        });
    }

    let mut aborted = false;
    if status == "processing" {
        aborted = stop_processing_job(pool, runs, job_id).await?;
    }

    let updated = sqlx::query(
        r#"UPDATE background_jobs
           SET status = 'pending',
               started_at = NULL,
               completed_at = NULL,
               error_message = NULL,
               run_after = clock_timestamp(),
               updated_at = clock_timestamp()
           WHERE id = $1
             AND status IN ('failed', 'cancelled', 'processing', 'pending', 'stalling')"#,
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(JobControlError::InvalidStatus {
            current: status,
            action: "restart",
        });
    }

    append_system_job_log_line(pool, job_id, "Restarted by administrator (requeued as pending)").await;
    Ok(aborted)
}