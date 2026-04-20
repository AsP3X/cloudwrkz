use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TicketRow {
    pub id: String,
    pub ticket_number: String,
    pub title: String,
    pub description: Option<String>,
    pub description_plain: Option<String>,
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub attachments: Vec<String>,
    pub created_by_id: Option<String>,
    pub assigned_to_id: Option<String>,
    pub assigned_to_group_id: Option<String>,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub due_date: Option<chrono::NaiveDateTime>,
    pub resolved_at: Option<chrono::NaiveDateTime>,
    pub closed_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct TicketListItem {
    pub id: String,
    pub ticket_number: String,
    pub title: String,
    pub description: Option<String>,
    pub description_plain: Option<String>,
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<super::user::UserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<super::user::UserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to_group: Option<GroupSummary>,
    pub comment_count: i64,
}

#[derive(Debug, Serialize)]
pub struct GroupSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TicketUpdateRequest {
    /// iOS / JSON clients send `archivedAt`; snake_case `archived_at` is also accepted.
    #[serde(alias = "archivedAt")]
    pub archived_at: Option<serde_json::Value>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub r#type: Option<String>,
    pub assigned_to_id: Option<String>,
    pub assigned_to_group_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TicketCreateRequest {
    pub title: String,
    pub description: Option<String>,
    pub description_plain: Option<String>,
    pub r#type: Option<String>,
    pub priority: Option<String>,
    pub assigned_to_id: Option<String>,
    pub assigned_to_group_id: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TicketListParams {
    pub status: Option<String>,
    pub sort: Option<String>,
    pub created_by: Option<String>,
    pub assigned_to_group: Option<String>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
    pub archive: Option<String>,
}

/// User summary with role, for comment author display (e.g. role badge).
#[derive(Debug, Serialize)]
pub struct CommentAuthor {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TicketCommentItem {
    pub id: String,
    pub content: String,
    pub content_html: Option<String>,
    pub content_plain: Option<String>,
    pub merged_from_ticket_number: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub is_agent_only: bool,
    pub user_id: Option<String>,
    pub author_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<CommentAuthor>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TicketCommentCreateRequest {
    pub content: String,
    #[serde(default)]
    pub is_agent_only: bool,
}

#[derive(Debug, Serialize)]
pub struct TicketActivityItem {
    pub id: String,
    pub activity_type: String,
    pub merged_from_ticket_number: Option<String>,
    pub changed_by_id: Option<String>,
    pub changed_by_name: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changed_by: Option<super::user::UserSummary>,
}
