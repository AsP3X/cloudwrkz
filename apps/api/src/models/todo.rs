use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TodoRow {
    pub id: String,
    pub todo_number: Option<String>,
    pub parent_todo_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub description_html: Option<String>,
    pub description_plain: Option<String>,
    pub status: String,
    pub priority: String,
    pub assigned_to_id: Option<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub start_date: Option<chrono::NaiveDateTime>,
    pub due_date: Option<chrono::NaiveDateTime>,
    pub completed_date: Option<chrono::NaiveDateTime>,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub ticket_id: Option<String>,
    pub order: i32,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct TodoParentSummary {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct TodoTicketSummary {
    pub id: String,
    pub ticket_number: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct TodoDependsOnSummary {
    pub id: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct TodoDependencyItem {
    pub depends_on_todo: TodoDependsOnSummary,
}

#[derive(Debug, Serialize)]
pub struct TodoListItem {
    pub id: String,
    pub todo_number: Option<String>,
    pub parent_todo_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub description_html: Option<String>,
    pub description_plain: Option<String>,
    pub status: String,
    pub priority: String,
    pub assigned_to_id: Option<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub start_date: Option<chrono::NaiveDateTime>,
    pub due_date: Option<chrono::NaiveDateTime>,
    pub completed_date: Option<chrono::NaiveDateTime>,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub ticket_id: Option<String>,
    pub order: i32,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_to: Option<super::user::UserSummary>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub subtodos: Vec<TodoListItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_todo: Option<TodoParentSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<TodoTicketSummary>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<TodoDependencyItem>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTodoRequest {
    pub title: String,
    pub description: Option<String>,
    pub description_html: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub parent_todo_id: Option<String>,
    pub ticket_id: Option<String>,
    pub assigned_to_id: Option<String>,
    pub estimated_hours: Option<f64>,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTodoRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub description_html: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assigned_to_id: Option<serde_json::Value>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub start_date: Option<serde_json::Value>,
    pub due_date: Option<serde_json::Value>,
    pub archived_at: Option<serde_json::Value>,
    pub ticket_id: Option<serde_json::Value>,
    pub order: Option<i32>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TodoListParams {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub sort: Option<String>,
    pub archive: Option<String>,
    pub kind: Option<String>,
    pub limit: Option<i64>,
    /// When set, return only todos linked to this ticket (user must have ticket access).
    pub ticket_id: Option<String>,
}
