use axum::{extract::State, routing::get, Json, Router};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::collection::CollectionListItem;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/collections", get(list_collections))
}

async fn list_collections(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    let rows = sqlx::query(
        r#"SELECT c.id, c.name, c.description, c.color, c.owner_id,
                  c.archived_at, c.created_at, c.updated_at,
                  (SELECT COUNT(*) FROM link_collections lc WHERE lc.collection_id = c.id) as link_count
           FROM collections c
           WHERE c.owner_id = $1
              OR c.id IN (SELECT collection_id FROM collection_members WHERE user_id = $1)
           ORDER BY c.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await?;

    let collections: Vec<CollectionListItem> = rows
        .iter()
        .map(|r| CollectionListItem {
            id: r.get("id"),
            name: r.get("name"),
            description: r.get("description"),
            color: r.get("color"),
            owner_id: r.get("owner_id"),
            archived_at: r.get("archived_at"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
            link_count: r.get("link_count"),
        })
        .collect();

    Ok(Json(serde_json::json!({ "collections": collections })))
}
