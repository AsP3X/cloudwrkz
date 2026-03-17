use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CollectionListItem {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub owner_id: String,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub link_count: i64,
}
