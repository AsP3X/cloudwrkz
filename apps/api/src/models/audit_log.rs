use serde::Serialize;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[allow(dead_code)]
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
