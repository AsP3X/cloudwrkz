use serde::Serialize;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct NotificationRow {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub title: String,
    pub body: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub resource_url: Option<String>,
    pub read: bool,
    pub created_at: chrono::NaiveDateTime,
}
