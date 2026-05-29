//! DB worker for `qr_login_finalize` background jobs.

// Human: After mobile approval, the browser’s finalize job claims the one-time session token from `qr_login_requests` and attaches IP/UA metadata to that session.
// Agent: READS payload request_id browser_token; attempt_qr_finalize_session CTE FOR UPDATE SKIP LOCKED; REQUEUE pending + run_after on RetrySoon/Transient; UPDATE background_jobs payload result.

use sqlx::{PgPool, Row};
use tracing::{info, warn};

use crate::audit::{self, WriteAuditParams};
use crate::auth::device_identity::{
    ClientDeviceReport, ClientHintHeaders, resolve_device_identity,
};
use crate::db::is_transient_sqlx;
use crate::error::AppError;
use crate::job_queue::JobLogger;
use crate::models::user::{LoginResponse, LoginUserInfo};

// Human: Missing JSON fields fail the job immediately; success stores token+user inside the job row for the client poller to read.
// Agent: VALIDATES payload; MATCH attempt_qr_finalize_session; UPDATE background_jobs completed jsonb_set result OR pending run_after OR failed.

pub async fn execute_qr_login_finalize_job(
    pool: &PgPool,
    job_id: &str,
    payload: &serde_json::Value,
    logger: Option<&JobLogger>,
) {
    let Some(request_id) = payload
        .get("request_id")
        .and_then(|v| v.as_str())
        .map(String::from)
    else {
        mark_job_failed(pool, job_id, "Missing payload.request_id", logger).await;
        return;
    };
    let Some(browser_token) = payload
        .get("browser_token")
        .and_then(|v| v.as_str())
        .map(String::from)
    else {
        mark_job_failed(pool, job_id, "Missing payload.browser_token", logger).await;
        return;
    };
    let ip = payload.get("ip").and_then(|v| v.as_str()).map(String::from);
    let user_agent = payload
        .get("user_agent")
        .and_then(|v| v.as_str())
        .map(String::from);

    match attempt_qr_finalize_session(
        pool,
        &request_id,
        &browser_token,
        ip.clone(),
        user_agent.clone(),
    )
    .await
    {
        Ok(response) => {
            if let Some(log) = logger {
                log.log("QR finalize succeeded; session attached");
            }
            let result = serde_json::json!({
                "status": "completed",
                "token": response.token,
                "user": response.user,
            });
            let _ = sqlx::query(
                r#"UPDATE background_jobs
                   SET status = 'completed',
                       error_message = NULL,
                       payload = jsonb_set(payload, '{result}', $2::jsonb, true),
                       updated_at = clock_timestamp(),
                       completed_at = clock_timestamp()
                   WHERE id = $1"#,
            )
            .bind(job_id)
            .bind(sqlx::types::Json(result))
            .execute(pool)
            .await;
            info!(event = "auth.qr_login.finalize_job_ok", job_id = %job_id, request_id = %request_id, "QR finalize job completed");
        }
        Err(QrFinalizeAttemptError::RetrySoon) => {
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
        Err(QrFinalizeAttemptError::Transient) => {
            if let Some(log) = logger {
                log.log("Transient DB error — job requeued for retry");
            }
            let _ = sqlx::query(
                r#"UPDATE background_jobs
                   SET status = 'pending',
                       started_at = NULL,
                       run_after = clock_timestamp() + interval '400 milliseconds',
                       updated_at = clock_timestamp()
                   WHERE id = $1 AND status = 'processing'"#,
            )
            .bind(job_id)
            .execute(pool)
            .await;
        }
        Err(QrFinalizeAttemptError::Final(e)) => {
            audit::write_audit_log(
                pool,
                WriteAuditParams {
                    user_id: None,
                    action: "auth.qr_login.finalize.attempt".into(),
                    resource_type: Some("qr_login_request".into()),
                    resource_id: Some(request_id.clone()),
                    context: Some(serde_json::json!({ "outcome": "failed", "reason": e.code })),
                    ip_address: ip,
                    user_agent,
                },
            );
            mark_job_failed(pool, job_id, &e.message, logger).await;
            warn!(event = "auth.qr_login.finalize_job_fail", job_id = %job_id, request_id = %request_id, error = %e.message, "QR finalize job failed");
        }
    }
}

// Human: Terminal failure updates are fire-and-forget because the worker already chose the outcome and further errors would only recurse.
// Agent: UPDATE background_jobs SET failed error_message; IGNORES sqlx execute Err.

async fn mark_job_failed(
    pool: &PgPool,
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

pub enum QrFinalizeAttemptError {
    RetrySoon,
    Transient,
    Final(AppError),
}

// Human: Transient DB errors let the dispatcher re-run the job; other sqlx failures become a generic internal error for the finalize path.
// Agent: is_transient_sqlx -> Transient; ELSE Final(internal).

fn map_sqlx(err: sqlx::Error) -> QrFinalizeAttemptError {
    if is_transient_sqlx(&err) {
        return QrFinalizeAttemptError::Transient;
    }
    QrFinalizeAttemptError::Final(AppError::internal("A database error occurred"))
}

// Human: `RetrySoon` means another worker holds the approving row but the session token is visible—we back off so the browser does not burn the token early.
// Agent: BEGIN tx; UPDATE qr_login_requests claim session_token FOR UPDATE SKIP LOCKED; COUNT visible approved rows -> RetrySoon; UPDATE sessions metadata; COMMIT; audit auth.login.

pub async fn attempt_qr_finalize_session(
    pool: &PgPool,
    request_id: &str,
    browser_token: &str,
    ip: Option<String>,
    user_agent: Option<String>,
) -> Result<LoginResponse, QrFinalizeAttemptError> {
    let mut tx = pool.begin().await.map_err(map_sqlx)?;

    let row = sqlx::query(
        r#"WITH picked AS (
              SELECT id, session_token, user_id
              FROM qr_login_requests
              WHERE id = $1
                AND browser_token = $2
                AND status = 'APPROVED'
                AND session_token IS NOT NULL
                AND expires_at > NOW()
              FOR UPDATE SKIP LOCKED
            )
            UPDATE qr_login_requests q
            SET session_token = NULL, updated_at = NOW()
            FROM picked
            WHERE q.id = picked.id
            RETURNING picked.session_token AS session_token, picked.user_id AS user_id"#,
    )
    .bind(request_id)
    .bind(browser_token)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_sqlx)?;

    let Some(row) = row else {
        let visible = sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(*)::bigint
               FROM qr_login_requests
               WHERE id = $1
                 AND browser_token = $2
                 AND status = 'APPROVED'
                 AND session_token IS NOT NULL
                 AND expires_at > NOW()"#,
        )
        .bind(request_id)
        .bind(browser_token)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx)?;
        tx.rollback().await.ok();
        if visible > 0 {
            return Err(QrFinalizeAttemptError::RetrySoon);
        }
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: None,
                action: "auth.qr_login.finalize.attempt".into(),
                resource_type: Some("qr_login_request".into()),
                resource_id: Some(request_id.to_string()),
                context: Some(serde_json::json!({ "outcome": "not_ready_or_invalid" })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(QrFinalizeAttemptError::Final(AppError::bad_request(
            "QR session is not ready or was already used.",
        )));
    };

    let session_token_existing: String = row.try_get("session_token").map_err(|e| {
        QrFinalizeAttemptError::Final(AppError::internal(format!("session_token column: {e}")))
    })?;
    let user_id: String = row
        .try_get("user_id")
        .map_err(|e| QrFinalizeAttemptError::Final(AppError::internal(format!("user_id: {e}"))))?;

    let user = sqlx::query(
        r#"SELECT id, email, name, status::text as status, email_verified
           FROM users WHERE id = $1"#,
    )
    .bind(&user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_sqlx)?
    .ok_or_else(|| {
        QrFinalizeAttemptError::Final(AppError::internal("User missing for QR session."))
    })?;

    let u_email: String = user
        .try_get("email")
        .map_err(|e| QrFinalizeAttemptError::Final(AppError::internal(format!("email: {e}"))))?;
    let u_name: Option<String> = user.try_get("name").ok();
    let status: String = user
        .try_get("status")
        .map_err(|e| QrFinalizeAttemptError::Final(AppError::internal(format!("status: {e}"))))?;
    let email_verified: bool = user.try_get("email_verified").map_err(|e| {
        QrFinalizeAttemptError::Final(AppError::internal(format!("email_verified: {e}")))
    })?;

    if status != "ACTIVE" || !email_verified {
        tx.rollback().await.ok();
        audit::write_audit_log(
            pool,
            WriteAuditParams {
                user_id: Some(user_id.clone()),
                action: "auth.qr_login.finalize.attempt".into(),
                resource_type: Some("qr_login_request".into()),
                resource_id: Some(request_id.to_string()),
                context: Some(serde_json::json!({
                    "outcome": "inactive_or_unverified",
                    "status": status,
                    "email_verified": email_verified
                })),
                ip_address: ip.clone(),
                user_agent: user_agent.clone(),
            },
        );
        return Err(QrFinalizeAttemptError::Final(AppError::unauthorized(
            "Account not active. Please complete verification or contact support.",
        )));
    }

    let device = resolve_device_identity(
        user_agent.as_deref(),
        &ClientDeviceReport::default(),
        &ClientHintHeaders::default(),
    );

    sqlx::query(
        r#"UPDATE sessions SET user_agent = COALESCE($2, user_agent),
                              ip_address = COALESCE($3, ip_address),
                              device_name = COALESCE($5, device_name),
                              device_type = COALESCE($6, device_type),
                              device_os = COALESCE($7, device_os),
                              device_browser = COALESCE($8, device_browser),
                              updated_at = NOW()
           WHERE token = $1 AND user_id = $4"#,
    )
    .bind(&session_token_existing)
    .bind(&user_agent)
    .bind(&ip)
    .bind(&user_id)
    .bind(&device.device_name)
    .bind(&device.device_type)
    .bind(&device.device_os)
    .bind(&device.device_browser)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx)?;

    tx.commit().await.map_err(map_sqlx)?;

    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "auth.login".into(),
            resource_type: None,
            resource_id: None,
            context: Some(serde_json::json!({ "method": "qr_code_web", "outcome": "success" })),
            ip_address: ip.clone(),
            user_agent: user_agent.clone(),
        },
    );
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(user_id.clone()),
            action: "auth.qr_login.browser_session".into(),
            resource_type: Some("qr_login_request".into()),
            resource_id: Some(request_id.to_string()),
            context: Some(serde_json::json!({ "outcome": "success" })),
            ip_address: ip,
            user_agent,
        },
    );

    Ok(LoginResponse {
        token: session_token_existing,
        user: LoginUserInfo {
            name: u_name,
            email: u_email,
        },
    })
}
