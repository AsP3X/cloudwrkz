use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TimeEntryRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub started_at: chrono::NaiveDateTime,
    pub paused_at: Option<chrono::NaiveDateTime>,
    pub stopped_at: Option<chrono::NaiveDateTime>,
    pub completed_at: Option<chrono::NaiveDateTime>,
    pub total_duration: i32,
    pub last_resumed_at: Option<chrono::NaiveDateTime>,
    pub user_id: String,
    pub ticket_id: Option<String>,
    pub tags: Vec<String>,
    pub billable: bool,
    pub location: Option<String>,
    pub timezone: Option<String>,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct TimeEntryWithBreaks {
    #[serde(flatten)]
    pub entry: TimeEntryRow,
    pub breaks: Vec<TimeEntryBreakRow>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TimeEntryBreakRow {
    pub id: String,
    pub time_entry_id: String,
    pub started_at: chrono::NaiveDateTime,
    pub ended_at: Option<chrono::NaiveDateTime>,
    pub duration: i32,
    pub description: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateTimeEntryRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub location: Option<String>,
    pub billable: Option<bool>,
    pub ticket_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AddTimeEntryRequest {
    pub name: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub location: Option<String>,
    pub billable: Option<bool>,
    pub hours: Option<i32>,
    pub minutes: Option<i32>,
    pub seconds: Option<i32>,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateTimeEntryRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub location: Option<String>,
    pub billable: Option<bool>,
    #[serde(default, alias = "startedAt")]
    pub started_at: Option<String>,
    #[serde(default, alias = "stoppedAt")]
    pub stopped_at: Option<serde_json::Value>,
    #[serde(default)]
    pub timezone: Option<serde_json::Value>,
    pub archived_at: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateBreakRequest {
    pub started_at: Option<String>,
    pub ended_at: Option<serde_json::Value>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateBreakRequest {
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct TimeEntryListParams {
    pub status: Option<String>,
    pub sort: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub archive: Option<String>,
}
