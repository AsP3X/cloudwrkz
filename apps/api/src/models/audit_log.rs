use serde::Serialize;

// Human: One row from `audit_log` as returned to admin UIs; optional fields exist when the action was system-triggered or lacked HTTP context.
// Agent: MAPS audit_log columns id, user_id, action, resource_type, resource_id, context JSON, ip_address, user_agent, created_at.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AuditLogRow {
    pub id: String,
    pub user_id: Option<String>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub context: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: chrono::NaiveDateTime,
}
