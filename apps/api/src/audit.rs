//! Audit log: fire-and-forget writes to audit_logs for auth and admin actions.
//! Failures are logged but do not affect the request.

use axum::http::HeaderMap;
use sqlx::types::Json;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::warn;

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

/// Extract client IP from headers (X-Forwarded-For, X-Real-IP, or empty).
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

/// Write an audit log entry. Fire-and-forget: spawns a task; errors are logged only.
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
