//! Time tracking rows, nested breaks, and create/update payloads used by REST routes and `job_queue/time_entry_mutations`.

// Human: `TimeEntryWithBreaks` flattens the parent entry plus ordered breaks so timers match how the mobile app models state.
// Agent: TimeEntryRow sqlx::FromRow; TimeEntryBreakRow; CreateTimeEntryRequest/Update* mirror handler validation types.

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
    pub customer_id: Option<String>,
    pub customer_contact_id: Option<String>,
    pub hourly_rate: Option<f64>,
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
    #[serde(default, alias = "customerId")]
    pub customer_id: Option<String>,
    #[serde(default, alias = "customerContactId")]
    pub customer_contact_id: Option<String>,
    #[serde(default, alias = "hourlyRate")]
    pub hourly_rate: Option<f64>,
    #[serde(default, alias = "startedAt")]
    pub started_at: Option<String>,
}

/// One break interval for `POST /time-tracking/add` when the client sends `stopped_at` + `manual_breaks` (iOS add sheet).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ManualCreateBreakInput {
    #[serde(alias = "startedAt")]
    pub started_at: String,
    #[serde(alias = "endedAt")]
    pub ended_at: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AddTimeEntryRequest {
    pub name: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub location: Option<String>,
    pub billable: Option<bool>,
    #[serde(default, alias = "customerId")]
    pub customer_id: Option<String>,
    #[serde(default, alias = "customerContactId")]
    pub customer_contact_id: Option<String>,
    #[serde(default, alias = "hourlyRate")]
    pub hourly_rate: Option<f64>,
    pub hours: Option<i32>,
    pub minutes: Option<i32>,
    pub seconds: Option<i32>,
    #[serde(default, alias = "startedAt")]
    pub started_at: Option<String>,
    /// Wall-clock end when the client sends explicit timing (with optional `manual_breaks`). When omitted, `hours`/`minutes`/`seconds` + `break_seconds` define the span (legacy).
    #[serde(default, alias = "stoppedAt")]
    pub stopped_at: Option<String>,
    #[serde(default, alias = "manualBreaks")]
    pub manual_breaks: Option<Vec<ManualCreateBreakInput>>,
    /// Legacy: extend wall by this many seconds and insert one trailing break row when `stopped_at` is absent.
    #[serde(default, alias = "breakSeconds")]
    pub break_seconds: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateTimeEntryRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub location: Option<String>,
    pub billable: Option<bool>,
    #[serde(default, alias = "customerId")]
    pub customer_id: Option<serde_json::Value>,
    #[serde(default, alias = "customerContactId")]
    pub customer_contact_id: Option<serde_json::Value>,
    #[serde(default, alias = "hourlyRate")]
    pub hourly_rate: Option<serde_json::Value>,
    #[serde(default, alias = "startedAt")]
    pub started_at: Option<String>,
    #[serde(default, alias = "stoppedAt")]
    pub stopped_at: Option<serde_json::Value>,
    #[serde(default)]
    pub timezone: Option<serde_json::Value>,
    /// iOS / JSON clients send `archivedAt`; snake_case `archived_at` is also accepted.
    #[serde(alias = "archivedAt")]
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
