use serde::Serialize;

// Human: Represents an in-app notification row including deep links so the client can navigate when the user taps it.
// Agent: MAPS notifications table columns id, user_id, type, title, body, resource_type/id/url, read flag, created_at.

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
