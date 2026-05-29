//! DB work for `qr_login_approve` background jobs (no HTTP / [`AppState`] dependency).

// Human: When an approver confirms a QR request, this worker creates the web session row and flips the QR row to `APPROVED` with the session token the browser will finalize.
// Agent: execute_qr_login_approve_job READS payload; approve_in_db transaction; REQUEUE pending on retry_soon; UPDATE background_jobs completed/failed; audit on failure.

use chrono::Utc;
use serde_json::json;
use sqlx::Row;
use tracing::{info, warn};

use crate::audit::{self, WriteAuditParams};
use crate::auth::device_identity::{
    ClientDeviceReport, ClientHintHeaders, resolve_device_identity,
};
use crate::auth::session::generate_token;
use crate::id::new_cuid;
use crate::job_queue::JobLogger;

// Human: Payload must include the QR request id and the job must carry `created_by_user_id` so we never approve on behalf of an anonymous caller.
// Agent: VALIDATES qr_request_id + created_by_user_id; MATCH approve_in_db Ok/retry_soon/err; UPDATE background_jobs status; audit auth.qr_login.approve.attempt on fatal.

pub async fn execute_qr_login_approve_job(
    pool: &sqlx::PgPool,
    job_id: &str,
    payload: &serde_json::Value,
    created_by_user_id: Option<&str>,
    logger: Option<&JobLogger>,
) {
    let Some(qr_request_id) = payload
        .get("qr_request_id")
        .and_then(|v| v.as_str())
        .map(String::from)
    else {
        mark_job_failed(pool, job_id, "Missing payload.qr_request_id", logger).await;
        return;
    };

    let Some(approver_id) = created_by_user_id.map(String::from) else {
        mark_job_failed(
            pool,
            job_id,
            "Missing job owner (created_by_user_id).",
            logger,
        )
        .await;
        return;
    };
    let ip = payload.get("ip").and_then(|v| v.as_str()).map(String::from);
    let user_agent = payload
        .get("user_agent")
        .and_then(|v| v.as_str())
        .map(String::from);

    let res = approve_in_db(pool, &qr_request_id, &approver_id).await;
    match res {
        Ok(()) => {
            if let Some(log) = logger {
                log.log("QR approve succeeded; job completed");
            }
            let _ = sqlx::query(
                r#"UPDATE background_jobs SET status = 'completed', error_message = NULL, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
            )
            .bind(job_id)
            .execute(pool)
            .await;
            info!(event = "auth.qr_login.approve_job_ok", job_id = %job_id, "QR approve job completed");
        }
        Err(e) if e.retry_soon => {
            if let Some(log) = logger {
                log.log("QR row locked — job requeued for retry");
            }
            let _ = sqlx::query(
                r#"UPDATE background_jobs
                   SET status = 'pending',
                       started_at = NULL,
                       run_after = clock_timestamp() + interval '200 milliseconds',
                       updated_at = clock_timestamp()
                   WHERE id = $1 AND status = 'processing'"#,
            )
            .bind(job_id)
            .execute(pool)
            .await;
        }
        Err(e) => {
            let msg = e.message.clone();
            if let Some(log) = logger {
                log.log(&format!("QR approve failed: {msg}"));
            }
            warn!(event = "auth.qr_login.approve_job_fail", job_id = %job_id, error = %msg, "QR approve job failed");
            audit::write_audit_log(
                pool,
                WriteAuditParams {
                    user_id: Some(approver_id.clone()),
                    action: "auth.qr_login.approve.attempt".into(),
                    resource_type: Some("qr_login_request".into()),
                    resource_id: Some(qr_request_id.clone()),
                    context: Some(json!({ "outcome": "failed", "reason": msg })),
                    ip_address: ip,
                    user_agent,
                },
            );
            let _ = sqlx::query(
                r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
            )
            .bind(job_id)
            .bind(&msg)
            .execute(pool)
            .await;
        }
    }
}

// Human: Same pattern as finalize: best-effort SQL so a secondary failure does not panic the worker after the main logic ran.
// Agent: UPDATE background_jobs failed; IGNORES Err.

async fn mark_job_failed(
    pool: &sqlx::PgPool,
    job_id: &str,
    msg: &str,
    logger: Option<&JobLogger>,
) {
    if let Some(log) = logger {
        log.log(&format!("Job failed: {msg}"));
    }
    let _ = sqlx::query(
        r#"UPDATE background_jobs SET status = 'failed', error_message = $2, updated_at = clock_timestamp(), completed_at = clock_timestamp() WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(msg)
    .execute(pool)
    .await;
}

struct ApproveFail {
    message: String,
    retry_soon: bool,
}

// Human: `FOR UPDATE SKIP LOCKED` plus a follow-up count distinguishes “row missing” from “row locked by another finalize/approve worker” for short retries.
// Agent: SELECT qr_login_requests FOR UPDATE; INSERT sessions for approver; UPDATE qr_login_requests APPROVED session_token; COMMIT; ApproveFail retry_soon when locked visible.

async fn approve_in_db(
    pool: &sqlx::PgPool,
    qr_request_id: &str,
    approver_id: &str,
) -> Result<(), ApproveFail> {
    let mut tx = pool.begin().await.map_err(|e| ApproveFail {
        message: format!("database: {e}"),
        retry_soon: false,
    })?;

    let row = sqlx::query(
        r#"SELECT id, status, expires_at
           FROM qr_login_requests
           WHERE id = $1
           FOR UPDATE SKIP LOCKED"#,
    )
    .bind(qr_request_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| ApproveFail {
        message: format!("database: {e}"),
        retry_soon: false,
    })?;

    let Some(row) = row else {
        let visible: i64 =
            sqlx::query_scalar(r#"SELECT COUNT(*)::bigint FROM qr_login_requests WHERE id = $1"#)
                .bind(qr_request_id)
                .fetch_one(&mut *tx)
                .await
                .unwrap_or(0);
        tx.rollback().await.ok();
        if visible > 0 {
            return Err(ApproveFail {
                message: "Row currently locked by another worker.".into(),
                retry_soon: true,
            });
        }
        return Err(ApproveFail {
            message: "QR login request not found.".into(),
            retry_soon: false,
        });
    };

    let st: String = row.get("status");
    if st != "PENDING" {
        tx.rollback().await.ok();
        return Err(ApproveFail {
            message: "This QR login request was already used or expired.".into(),
            retry_soon: false,
        });
    }

    let exp: chrono::NaiveDateTime = row.get("expires_at");
    if exp < Utc::now().naive_utc() {
        sqlx::query(
            "UPDATE qr_login_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1",
        )
        .bind(qr_request_id)
        .execute(&mut *tx)
        .await
        .ok();
        tx.commit().await.ok();
        return Err(ApproveFail {
            message: "QR login request has expired.".into(),
            retry_soon: false,
        });
    }

    let session_token = generate_token();
    let expires_at = Utc::now().naive_utc() + chrono::Duration::hours(24);
    let session_id = new_cuid();
    let device = resolve_device_identity(
        None,
        &ClientDeviceReport {
            device_name: Some("Desktop · QR Login (Web)".into()),
            device_type: Some("desktop".into()),
            device_os: None,
            device_browser: Some("QR Login (Web)".into()),
        },
        &ClientHintHeaders::default(),
    );

    sqlx::query(
        r#"INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at,
                                  device_name, device_type, device_os, device_browser, user_agent)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8, $9)"#,
    )
    .bind(&session_id)
    .bind(&session_token)
    .bind(approver_id)
    .bind(expires_at)
    .bind(&device.device_name)
    .bind(&device.device_type)
    .bind(&device.device_os)
    .bind(&device.device_browser)
    .bind(None::<String>)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApproveFail {
        message: format!("session insert: {e}"),
        retry_soon: false,
    })?;

    sqlx::query(
        r#"UPDATE qr_login_requests SET status = 'APPROVED', user_id = $2, session_token = $3, updated_at = NOW() WHERE id = $1"#,
    )
    .bind(qr_request_id)
    .bind(approver_id)
    .bind(&session_token)
    .execute(&mut *tx)
    .await
    .map_err(|e| ApproveFail {
        message: format!("qr row update: {e}"),
        retry_soon: false,
    })?;

    tx.commit().await.map_err(|e| ApproveFail {
        message: format!("commit: {e}"),
        retry_soon: false,
    })?;

    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(approver_id.to_string()),
            action: "auth.qr_login.approve".into(),
            resource_type: Some("qr_login_request".into()),
            resource_id: Some(qr_request_id.to_string()),
            context: Some(json!({ "outcome": "success" })),
            ip_address: None,
            user_agent: None,
        },
    );

    Ok(())
}
