use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LinkRow {
    pub id: String,
    pub title: String,
    pub url: String,
    pub normalized_url: Option<String>,
    pub description: Option<String>,
    pub favicon: Option<String>,
    pub link_type: String,
    pub tags: Vec<String>,
    pub notes: Option<String>,
    pub is_favorite: bool,
    pub rating: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    pub metadata_extracted_at: Option<chrono::NaiveDateTime>,
    pub user_id: String,
    pub archived_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct LinkListResponse {
    pub links: Vec<LinkRow>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateLinkRequest {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub link_type: Option<String>,
    pub is_favorite: Option<bool>,
    pub collection_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLinkRequest {
    pub title: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub link_type: Option<String>,
    pub is_favorite: Option<bool>,
    pub rating: Option<serde_json::Value>,
    pub archived_at: Option<serde_json::Value>,
    pub collection_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
pub struct LinkListParams {
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub page: Option<i64>,
    pub is_favorite: Option<String>,
    pub collection_id: Option<String>,
    pub archive: Option<String>,
    pub link_type: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExtractMetadataRequest {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct ExtractMetadataResponse {
    pub title: Option<String>,
    pub description: Option<String>,
    pub favicon: Option<String>,
}
