use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
#[allow(dead_code)]
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

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct TicketUpdateRequest {
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

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
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
#[allow(dead_code)]
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
