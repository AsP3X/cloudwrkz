use axum::extract::Query;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use tracing::info;

use crate::audit::{self, WriteAuditParams};
use crate::auth::extractors::AuthUser;
use crate::auth::register_queue::new_job_id;
use crate::auth::session::generate_token;
use crate::error::AppError;
use crate::id::new_cuid;
use crate::job_queue::{JOB_TYPE_QR_LOGIN_APPROVE, JOB_TYPE_QR_LOGIN_FINALIZE};
use crate::routes::AppState;

const QR_LOGIN_EXPIRY_MINUTES: i64 = 5;
const MIN_QR_REQUESTS_PER_MINUTE: i32 = 1;
const MAX_QR_REQUESTS_PER_MINUTE: i32 = 120;

pub fn scoped_router() -> Router<AppState> {
    Router::new()
        .route("/request", post(qr_login_request))
        .route("/status", get(qr_login_status))
        .route("/approve", post(qr_login_approve))
        .route("/approve/status/{job_id}", get(qr_login_approve_job_status))
        .route("/finalize", post(qr_login_finalize))
        .route(
            "/finalize/status/{job_id}",
            get(qr_login_finalize_job_status),
        )
}

#[derive(Deserialize)]
struct QrStatusQuery {
    #[serde(alias = "requestId")]
    request_id: String,
}

#[derive(serde::Serialize)]
struct QrRequestResponse {
    request_id: String,
    browser_token: String,
    expires_at: String,
    qr_payload: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum QrPollStatus {
    Pending,
    Approved,
    Expired,
}

#[derive(serde::Serialize)]
struct QrStatusResponse {
    status: QrPollStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    expires_at: Option<String>,
    #[serde(default)]
    session_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Deserialize)]
struct QrApproveBody {
    #[serde(alias = "requestId")]
    request_id: String,
}

#[derive(serde::Serialize)]
struct QrQueuedResponse {
    message: String,
    queued: bool,
    job_id: String,
    retry_deadline_secs: u32,
}

#[derive(Deserialize)]
struct QrFinalizeBody {
    #[serde(alias = "requestId")]
    request_id: String,
}

async fn qr_login_rate_limit_per_minute(pool: &sqlx::PgPool) -> i32 {
    let v: Option<i32> = sqlx::query_scalar(
        r#"SELECT CASE
              WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::int
              WHEN jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^[0-9]+$'
                THEN (value #>> '{}')::int
              ELSE NULL
            END
            FROM system_settings
            WHERE key = 'qr_login_requests_per_minute'
            LIMIT 1"#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .flatten();
    v.unwrap_or(20)
        .clamp(MIN_QR_REQUESTS_PER_MINUTE, MAX_QR_REQUESTS_PER_MINUTE)
}

fn qr_payload_for_request(
    config: &crate::config::AppConfig,
    headers: &HeaderMap,
    request_id: &str,
) -> String {
    if let Some(ref base) = config.public_web_app_url {
        let t = base.trim_end_matches('/');
        return format!("{t}/qr-login?r={request_id}");
    }
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("https");
    let host = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");
    format!("{scheme}://{host}/qr-login?r={request_id}")
}

async fn qr_login_request(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<QrRequestResponse>), AppError> {
    let max_per_minute = qr_login_rate_limit_per_minute(&state.pool).await;
    let recent: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*)::bigint FROM qr_login_requests WHERE created_at >= NOW() - interval '1 minute'"#,
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    if recent >= max_per_minute as i64 {
        audit::write_audit_log(
            &state.pool,
            WriteAuditParams {
                user_id: None,
                action: "auth.qr_login.request".into(),
                resource_type: None,
                resource_id: None,
                context: Some(json!({ "outcome": "rate_limited" })),
                ip_address: audit::client_ip_from_headers(&headers),
                user_agent: headers
                    .get("user-agent")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from),
            },
        );
        return Err(AppError {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: "RATE_LIMITED".into(),
            message: "Too many QR login attempts. Try again later.".into(),
            fields: None,
            transient_database: false,
        });
    }

    let browser_token = generate_token();
    let id = new_cuid();
    let expires_at = Utc::now().naive_utc() + chrono::Duration::minutes(QR_LOGIN_EXPIRY_MINUTES);

    sqlx::query(
        r#"INSERT INTO qr_login_requests (id, browser_token, status, expires_at, created_at, updated_at)
           VALUES ($1, $2, 'PENDING', $3, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&browser_token)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    let ip = audit::client_ip_from_headers(&headers);
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: None,
            action: "auth.qr_login.request".into(),
            resource_type: Some("qr_login_request".into()),
            resource_id: Some(id.clone()),
            context: Some(json!({ "outcome": "created" })),
            ip_address: ip,
            user_agent: ua,
        },
    );

    let qr_payload = qr_payload_for_request(&state.config, &headers, &id);
    Ok((
        StatusCode::CREATED,
        Json(QrRequestResponse {
            request_id: id,
            browser_token,
            expires_at: chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
                expires_at,
                chrono::Utc,
            )
            .to_rfc3339(),
            qr_payload,
        }),
    ))
}

async fn qr_login_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Query(q): Query<QrStatusQuery>,
) -> Result<Json<QrStatusResponse>, AppError> {
    let browser_token = headers
        .get("x-qr-browser-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::bad_request("Missing X-QR-Browser-Token header."))?;

    let row = sqlx::query(
        r#"SELECT id, browser_token, status, expires_at, session_token FROM qr_login_requests WHERE id = $1"#,
    )
    .bind(&q.request_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        return Ok(Json(QrStatusResponse {
            status: QrPollStatus::Expired,
            expires_at: None,
            session_available: false,
            message: Some("Request not found or expired.".into()),
        }));
    };

    if row.get::<String, _>("browser_token") != browser_token {
        return Err(AppError::forbidden(
            "Invalid browser token for this request.",
        ));
    }

    let expires_at: chrono::NaiveDateTime = row.get("expires_at");
    let expires_rfc =
        chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(expires_at, chrono::Utc)
            .to_rfc3339();

    let now = Utc::now().naive_utc();
    let mut status: String = row.get("status");
    if expires_at < now && status == "PENDING" {
        sqlx::query(
            "UPDATE qr_login_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1",
        )
        .bind(&q.request_id)
        .execute(&state.pool)
        .await
        .ok();
        status = "EXPIRED".into();
    }

    if status == "EXPIRED" || expires_at < now {
        return Ok(Json(QrStatusResponse {
            status: QrPollStatus::Expired,
            expires_at: Some(expires_rfc),
            session_available: false,
            message: None,
        }));
    }

    if status == "APPROVED" {
        let session_token: Option<String> = row.get("session_token");
        let available = session_token.is_some();
        return Ok(Json(QrStatusResponse {
            status: QrPollStatus::Approved,
            expires_at: Some(expires_rfc),
            session_available: available,
            message: None,
        }));
    }

    Ok(Json(QrStatusResponse {
        status: QrPollStatus::Pending,
        expires_at: Some(expires_rfc),
        session_available: false,
        message: None,
    }))
}

async fn qr_login_approve(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    AuthUser(user): AuthUser,
    Json(body): Json<QrApproveBody>,
) -> Result<(StatusCode, Json<QrQueuedResponse>), AppError> {
    let rid = body.request_id.trim().to_string();
    if rid.is_empty() || rid.len() > 100 {
        return Err(AppError::bad_request("Invalid or missing request_id."));
    }

    let row = sqlx::query(r#"SELECT id, status, expires_at FROM qr_login_requests WHERE id = $1"#)
        .bind(&rid)
        .fetch_optional(&state.pool)
        .await?;

    let Some(row) = row else {
        return Err(AppError::not_found(
            "QR login request not found or expired.",
        ));
    };

    let st: String = row.get("status");
    if st != "PENDING" {
        return Err(AppError {
            status: StatusCode::CONFLICT,
            code: "CONFLICT".into(),
            message: "This QR login request was already used or expired.".into(),
            fields: None,
            transient_database: false,
        });
    }

    let exp: chrono::NaiveDateTime = row.get("expires_at");
    if exp < Utc::now().naive_utc() {
        sqlx::query(
            "UPDATE qr_login_requests SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1",
        )
        .bind(&rid)
        .execute(&state.pool)
        .await
        .ok();
        return Err(AppError {
            status: StatusCode::GONE,
            code: "GONE".into(),
            message: "QR login request has expired.".into(),
            fields: None,
            transient_database: false,
        });
    }

    let ip = audit::client_ip_from_headers(&headers);
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: Some(user.id.clone()),
            action: "auth.qr_login.approve.attempt".into(),
            resource_type: Some("qr_login_request".into()),
            resource_id: Some(rid.clone()),
            context: Some(json!({ "outcome": "queued" })),
            ip_address: ip.clone(),
            user_agent: ua.clone(),
        },
    );

    let job_id = new_cuid();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW(), NULL)"#,
    )
    .bind(&job_id)
    .bind(JOB_TYPE_QR_LOGIN_APPROVE)
    .bind(sqlx::types::Json(json!({
        "qr_request_id": rid,
        "ip": ip,
        "user_agent": ua
    })))
    .bind(format!("{JOB_TYPE_QR_LOGIN_APPROVE}:{job_id}"))
    .bind(&user.id)
    .execute(&state.pool)
    .await?;

    info!(
        event = "auth.qr_login.approve_queued",
        job_id = %job_id,
        user_id = %user.id,
        "QR approve enqueued"
    );

    Ok((
        StatusCode::ACCEPTED,
        Json(QrQueuedResponse {
            message: "Approval is processing in the background. Poll GET /auth/qr-login/approve/status/{job_id} until completed."
                .into(),
            queued: true,
            job_id,
            retry_deadline_secs: 120,
        }),
    ))
}

async fn qr_login_approve_job_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    AuthUser(user): AuthUser,
    axum::extract::Path(job_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query(
        r#"SELECT id, job_type, status, error_message, created_by_user_id FROM background_jobs WHERE id = $1"#,
    )
    .bind(&job_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        return Err(AppError::not_found("Unknown job."));
    };

    if row.get::<String, _>("job_type") != JOB_TYPE_QR_LOGIN_APPROVE {
        return Err(AppError::not_found("Unknown job."));
    }

    let owner: Option<String> = row.get("created_by_user_id");
    if owner.as_deref() != Some(user.id.as_str()) {
        return Err(AppError::forbidden("This job belongs to another user."));
    }

    let status: String = row.get("status");
    let body = match status.as_str() {
        "pending" | "processing" => json!({ "status": "pending" }),
        "completed" => json!({ "status": "completed" }),
        "failed" => json!({
            "status": "failed",
            "message": row.try_get::<Option<String>, _>("error_message").ok().flatten()
        }),
        _ => json!({ "status": "failed", "message": "Unexpected job state." }),
    };

    Ok(Json(body))
}

async fn qr_login_finalize(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Json(body): Json<QrFinalizeBody>,
) -> Result<(StatusCode, Json<QrQueuedResponse>), AppError> {
    let browser_token = headers
        .get("x-qr-browser-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::bad_request("Missing X-QR-Browser-Token header."))?
        .to_string();

    let rid = body.request_id.trim().to_string();
    if rid.is_empty() || rid.len() > 100 {
        return Err(AppError::bad_request("Invalid or missing request_id."));
    }

    let ip = audit::client_ip_from_headers(&headers);
    let ua = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    audit::write_audit_log(
        &state.pool,
        WriteAuditParams {
            user_id: None,
            action: "auth.qr_login.finalize.attempt".into(),
            resource_type: Some("qr_login_request".into()),
            resource_id: Some(rid.clone()),
            context: Some(json!({ "outcome": "queued" })),
            ip_address: ip.clone(),
            user_agent: ua.clone(),
        },
    );

    let job_id = new_job_id();
    sqlx::query(
        r#"INSERT INTO background_jobs (id, job_type, payload, status, dedupe_key, created_by_user_id, created_at, updated_at, run_after)
           VALUES ($1, $2, $3, 'pending', $4, NULL, NOW(), NOW(), NULL)"#,
    )
    .bind(&job_id)
    .bind(JOB_TYPE_QR_LOGIN_FINALIZE)
    .bind(sqlx::types::Json(json!({
        "request_id": rid,
        "browser_token": browser_token,
        "ip": ip,
        "user_agent": ua
    })))
    .bind(format!("{JOB_TYPE_QR_LOGIN_FINALIZE}:{job_id}"))
    .execute(&state.pool)
    .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(QrQueuedResponse {
            message: "Completing sign-in in the background. Poll GET /auth/qr-login/finalize/status/{job_id} until completed."
                .into(),
            queued: true,
            job_id,
            retry_deadline_secs: 45,
        }),
    ))
}

async fn qr_login_finalize_job_status(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(job_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let browser_token = headers
        .get("x-qr-browser-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::bad_request("Missing X-QR-Browser-Token header."))?;

    let row = sqlx::query(
        r#"SELECT job_type, status, error_message, payload
           FROM background_jobs
           WHERE id = $1"#,
    )
    .bind(&job_id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(row) = row else {
        return Err(AppError::not_found("Unknown finalize job."));
    };
    if row.get::<String, _>("job_type") != JOB_TYPE_QR_LOGIN_FINALIZE {
        return Err(AppError::not_found("Unknown finalize job."));
    }
    let payload: serde_json::Value = row.get("payload");
    let owner_token = payload
        .get("browser_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::forbidden("Finalize job token mismatch."))?;
    if owner_token != browser_token {
        return Err(AppError::forbidden("Finalize job token mismatch."));
    }

    let status: String = row.get("status");
    let body = match status.as_str() {
        "pending" | "processing" => json!({ "status": "pending" }),
        "completed" => {
            let result = payload.get("result").cloned().unwrap_or_else(|| json!({}));
            json!({
                "status": "completed",
                "token": result.get("token").cloned().unwrap_or(serde_json::Value::Null),
                "user": result.get("user").cloned().unwrap_or(serde_json::Value::Null)
            })
        }
        "failed" => json!({
            "status": "failed",
            "message": row.try_get::<Option<String>, _>("error_message").ok().flatten()
        }),
        _ => json!({ "status": "failed", "message": "Unexpected job state." }),
    };
    Ok(Json(body))
}
