//! Link CRUD request/response shapes, including embedded collection metadata returned from list queries.

// Human: `LinkRow` carries denormalized `collections` JSON so the web client can render chips without N+1 collection fetches.
// Agent: sqlx::FromRow LinkRow; CreateLinkRequest flags extract_metadata allow_duplicates; UpdateLinkRequest serde alias archivedAt.

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
    /// Link collections for UI display (JSON array).
    /// Shape: [{ collection: { id, name, color } }, ...]
    pub collections: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct LinkListResponse {
    pub links: Vec<LinkRow>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateLinkRequest {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub link_type: Option<String>,
    pub is_favorite: Option<bool>,
    pub collection_ids: Option<Vec<String>>,
    /// When true, the API should attempt to extract title/description (and favicon) from the URL.
    pub extract_metadata: Option<bool>,
    /// When false (default), exact URL duplicates should block creation and return duplicate candidates.
    pub allow_duplicates: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateLinkRequest {
    pub title: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub link_type: Option<String>,
    pub is_favorite: Option<bool>,
    pub rating: Option<serde_json::Value>,
    /// iOS / JSON clients send `archivedAt`; snake_case `archived_at` is also accepted.
    #[serde(alias = "archivedAt")]
    pub archived_at: Option<serde_json::Value>,
    pub collection_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
pub struct LinkListParams {
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub page: Option<i64>,
    #[serde(rename = "isFavorite")]
    pub is_favorite: Option<String>,
    #[serde(rename = "collection")]
    pub collection_id: Option<String>,
    #[serde(rename = "archived")]
    pub archive: Option<String>,
    #[serde(rename = "linkType")]
    pub link_type: Option<String>,
    #[serde(rename = "minRating")]
    pub min_rating: Option<i32>,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ExtractMetadataRequest {
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractMetadataResponse {
    pub title: Option<String>,
    pub description: Option<String>,
    pub favicon: Option<String>,
}
