//! Audit log: fire-and-forget writes to `audit_logs` for auth, admin, and product mutations.
//! Failures are logged but do not affect the request.

use axum::http::HeaderMap;
use sqlx::PgPool;
use sqlx::types::Json;
use std::sync::Arc;
use tracing::warn;

// Human: Callers bundle everything needed for one audit row so the async write does not borrow request state across await points.
// Agent: HOLDS optional user_id, action string, resource_type/id, context JSON, ip, user_agent; PASSED by clone into spawned insert.

#[derive(Clone)]
pub struct WriteAuditParams {
    pub user_id: Option<String>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub context: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

/// Prefer `X-Request-Id` when present; otherwise a fresh UUID (matches trace spans).
// Human: Reuses the gateway-provided request id when valid UTF-8 so logs and traces line up across services.
// Agent: READS header x-request-id case-sensitive; FALLBACK uuid::new_v4 string.

pub fn request_id_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
}

/// Extract client IP from headers (X-Forwarded-For, X-Real-IP, or empty).
// Human: Behind proxies the first `X-Forwarded-For` hop is treated as the original client; otherwise we fall back to `X-Real-IP`.
// Agent: READS x-forwarded-for first comma segment OR x-real-ip trimmed; RETURNS None if absent/unparseable.

pub fn client_ip_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(v) = headers.get("x-forwarded-for") {
        if let Ok(s) = v.to_str() {
            return s.split(',').next().map(|s| s.trim().to_string());
        }
    }
    if let Some(v) = headers.get("x-real-ip") {
        if let Ok(s) = v.to_str() {
            return Some(s.trim().to_string());
        }
    }
    None
}

/// Extract User-Agent from request headers when present.
// Human: Browser and API clients identify themselves via the standard User-Agent header for audit attribution.
// Agent: READS user-agent header; RETURNS None when absent or non-UTF8.

pub fn user_agent_from_headers(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(String::from)
}

/// Merge `audit_ip` and `audit_user_agent` into a JSON job payload object for background workers.
// Human: HTTP handlers clone network metadata into enqueue payloads so job workers can write audit rows after async success.
// Agent: MUTATES payload object; INSERTS audit_ip + audit_user_agent keys from headers; NO-OP when payload is not an object.

pub fn attach_audit_fields(
    mut payload: serde_json::Value,
    headers: &HeaderMap,
) -> serde_json::Value {
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "audit_ip".to_string(),
            client_ip_from_headers(headers)
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
        obj.insert(
            "audit_user_agent".to_string(),
            user_agent_from_headers(headers)
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null),
        );
    }
    payload
}

/// Convenience wrapper for synchronous route handlers that already have `HeaderMap`.
// Human: Route handlers call this instead of assembling `WriteAuditParams` field-by-field on every mutation.
// Agent: CALLS write_audit_log; READS ip/ua from headers; ACCEPTS optional resource + context.

pub fn write_audit_from_headers(
    pool: &PgPool,
    user_id: Option<String>,
    action: &str,
    resource_type: Option<&str>,
    resource_id: Option<String>,
    context: Option<serde_json::Value>,
    headers: &HeaderMap,
) {
    write_audit_log(
        pool,
        WriteAuditParams {
            user_id,
            action: action.to_string(),
            resource_type: resource_type.map(String::from),
            resource_id,
            context,
            ip_address: client_ip_from_headers(headers),
            user_agent: user_agent_from_headers(headers),
        },
    );
}

/// Read optional audit IP stored on a background job payload.
// Agent: READS payload.audit_ip string; RETURNS None when missing or not a string.

pub fn ip_from_payload(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("audit_ip")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// Read optional audit User-Agent stored on a background job payload.
// Agent: READS payload.audit_user_agent string; RETURNS None when missing or not a string.

pub fn user_agent_from_payload(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("audit_user_agent")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// Write an audit log entry. Fire-and-forget: spawns a task; errors are logged only.
// Human: Audit writes never block the HTTP response; failures are warn-only so compliance logging cannot take down requests.
// Agent: SPAWNS tokio task; INSERT audit_logs with new_cuid id; CLONES all params into task; LOGS warn on sqlx Err.

pub fn write_audit_log(pool: &PgPool, params: WriteAuditParams) {
    let pool = Arc::new(pool.clone());
    let id = crate::id::new_cuid();
    let user_id = params.user_id.clone();
    let action = params.action.clone();
    let resource_type = params.resource_type.clone();
    let resource_id = params.resource_id.clone();
    let context = params.context.clone();
    let ip_address = params.ip_address.clone();
    let user_agent = params.user_agent.clone();

    tokio::spawn(async move {
        let res = sqlx::query(
            r#"INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, context, ip_address, user_agent)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        )
        .bind(&id)
        .bind(&user_id)
        .bind(&action)
        .bind(&resource_type)
        .bind(&resource_id)
        .bind(context.map(Json))
        .bind(&ip_address)
        .bind(&user_agent)
        .execute(pool.as_ref())
        .await;

        if let Err(e) = res {
            warn!(event = "audit.write_failed", action = %action, user_id = ?user_id, "audit log write failed: {}", e);
        }
    });
}
