//! Bulk link operations used by the Vite links list (archive, delete, collections, shared removal).

// Human: The SPA calls POST /links/bulk/* endpoints; these handlers run synchronously and return JSON success counts.
// Agent: REQUIRES links.delete|links.archive|links.share|collections.*; WRITES links/link_shares/link_collections; AUDIT bulk actions.

use axum::{
    Json, Router,
    extract::State,
    http::HeaderMap,
    routing::post,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;

use crate::audit;
use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::id::new_cuid;
use crate::routes::AppState;
use crate::routes::helpers::{check_permission, require_permission};

const MAX_BULK_LINK_IDS: usize = 200;

#[derive(Debug, Deserialize)]
pub struct LinkBulkIdsRequest {
    #[serde(rename = "link_ids", alias = "linkIds")]
    pub link_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkBulkAddToCollectionRequest {
    #[serde(rename = "link_ids", alias = "linkIds")]
    pub link_ids: Vec<String>,
    #[serde(rename = "collection_id", alias = "collectionId")]
    pub collection_id: String,
}

#[derive(Debug, Deserialize)]
pub struct LinkBulkCreateCollectionRequest {
    #[serde(rename = "link_ids", alias = "linkIds")]
    pub link_ids: Vec<String>,
    pub name: String,
    pub color: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/links/bulk/delete", post(bulk_delete))
        .route("/links/bulk/archive", post(bulk_archive))
        .route("/links/bulk/unarchive", post(bulk_unarchive))
        .route("/links/bulk/remove-shared", post(bulk_remove_shared))
        .route("/links/bulk/add-to-collection", post(bulk_add_to_collection))
        .route("/links/bulk/create-collection", post(bulk_create_collection))
}

fn normalize_link_ids(link_ids: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut out: Vec<String> = link_ids
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    out.sort();
    out.dedup();
    if out.is_empty() {
        return Err(AppError::bad_request("link_ids is required"));
    }
    if out.len() > MAX_BULK_LINK_IDS {
        return Err(AppError::bad_request(format!(
            "Too many links (max {MAX_BULK_LINK_IDS})"
        )));
    }
    Ok(out)
}

fn collection_hex_ok(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|x| x.is_ascii_hexdigit())
}

async fn user_owns_link(pool: &PgPool, user_id: &str, link_id: &str) -> Result<bool, AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM links WHERE id = $1 AND user_id = $2)",
    )
    .bind(link_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

// Human: Shared links can be filed into the recipient's own collections even though they do not own the bookmark row.
// Agent: OWNED links.user_id = user OR EXISTS link_shares for user.

async fn user_can_reference_link(pool: &PgPool, user_id: &str, link_id: &str) -> Result<bool, AppError> {
    let ok: bool = sqlx::query_scalar(
        r#"SELECT EXISTS(
             SELECT 1 FROM links l WHERE l.id = $1 AND l.user_id = $2
           ) OR EXISTS(
             SELECT 1 FROM link_shares ls WHERE ls.link_id = $1 AND ls.shared_with_user_id = $2
           )"#,
    )
    .bind(link_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(ok)
}

async fn collection_editable_by_user(
    pool: &PgPool,
    user_id: &str,
    collection_id: &str,
) -> Result<bool, AppError> {
    let ok: bool = sqlx::query_scalar(
        r#"SELECT EXISTS(
             SELECT 1 FROM collections c
             WHERE c.id = $1 AND c.archived_at IS NULL
               AND (
                 c.owner_id = $2
                 OR EXISTS(
                   SELECT 1 FROM collection_members cm
                   WHERE cm.collection_id = c.id AND cm.user_id = $2
                 )
               )
           )"#,
    )
    .bind(collection_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(ok)
}

fn write_bulk_audit(
    pool: &PgPool,
    user_id: &str,
    action: &str,
    link_ids: &[String],
    headers: &HeaderMap,
    extra: Option<serde_json::Value>,
) {
    let mut context = json!({ "linkIds": link_ids, "count": link_ids.len() });
    if let Some(extra) = extra {
        if let (Some(base), Some(overlay)) = (context.as_object_mut(), extra.as_object()) {
            for (k, v) in overlay {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    audit::write_audit_from_headers(
        pool,
        Some(user_id.to_string()),
        action,
        Some("link"),
        None,
        Some(context),
        headers,
    );
}

async fn bulk_delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "links.delete").await?;
    let link_ids = normalize_link_ids(body.link_ids)?;
    let mut deleted = 0i64;

    for link_id in &link_ids {
        if !user_owns_link(&state.pool, &user.id, link_id).await? {
            continue;
        }
        let res = sqlx::query("DELETE FROM links WHERE id = $1 AND user_id = $2")
            .bind(link_id)
            .bind(&user.id)
            .execute(&state.pool)
            .await?;
        deleted += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.delete",
        &link_ids,
        &headers,
        Some(json!({ "deleted": deleted })),
    );

    Ok(Json(json!({ "success": true, "deleted": deleted })))
}

async fn bulk_archive(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "links.archive").await?;
    let link_ids = normalize_link_ids(body.link_ids)?;
    let mut archived = 0i64;

    for link_id in &link_ids {
        if !user_owns_link(&state.pool, &user.id, link_id).await? {
            continue;
        }
        let res = sqlx::query(
            "UPDATE links SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND archived_at IS NULL",
        )
        .bind(link_id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
        archived += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.archive",
        &link_ids,
        &headers,
        Some(json!({ "archived": archived })),
    );

    Ok(Json(json!({ "success": true, "archived": archived })))
}

async fn bulk_unarchive(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "links.archive").await?;
    let link_ids = normalize_link_ids(body.link_ids)?;
    let mut unarchived = 0i64;

    for link_id in &link_ids {
        if !user_owns_link(&state.pool, &user.id, link_id).await? {
            continue;
        }
        let res = sqlx::query(
            "UPDATE links SET archived_at = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND archived_at IS NOT NULL",
        )
        .bind(link_id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
        unarchived += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.unarchive",
        &link_ids,
        &headers,
        Some(json!({ "unarchived": unarchived })),
    );

    Ok(Json(json!({ "success": true, "unarchived": unarchived })))
}

async fn bulk_remove_shared(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkIdsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "links.view").await?;
    let link_ids = normalize_link_ids(body.link_ids)?;
    let mut removed = 0i64;

    for link_id in &link_ids {
        let res = sqlx::query(
            "DELETE FROM link_shares WHERE link_id = $1 AND shared_with_user_id = $2",
        )
        .bind(link_id)
        .bind(&user.id)
        .execute(&state.pool)
        .await?;
        removed += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.remove_shared",
        &link_ids,
        &headers,
        Some(json!({ "removed": removed })),
    );

    Ok(Json(json!({ "success": true, "removed": removed })))
}

async fn bulk_add_to_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkAddToCollectionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.update").await
        && !check_permission(&state.pool, &user.id, "links.update").await
    {
        return Err(AppError::forbidden(
            "You do not have permission to update collections or links",
        ));
    }

    let link_ids = normalize_link_ids(body.link_ids)?;
    let collection_id = body.collection_id.trim().to_string();
    if collection_id.is_empty() {
        return Err(AppError::bad_request("collection_id is required"));
    }
    if !collection_editable_by_user(&state.pool, &user.id, &collection_id).await? {
        return Err(AppError::forbidden("You do not have access to this collection"));
    }

    let mut added = 0i64;
    for link_id in &link_ids {
        if !user_can_reference_link(&state.pool, &user.id, link_id).await? {
            continue;
        }
        let lc_id = new_cuid();
        let res = sqlx::query(
            "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
        )
        .bind(&lc_id)
        .bind(link_id)
        .bind(&collection_id)
        .execute(&state.pool)
        .await?;
        added += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.add_to_collection",
        &link_ids,
        &headers,
        Some(json!({ "collectionId": collection_id, "added": added })),
    );

    Ok(Json(json!({
        "success": true,
        "added": added,
        "collection_id": collection_id
    })))
}

async fn bulk_create_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<LinkBulkCreateCollectionRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "collections.create").await?;
    let link_ids = normalize_link_ids(body.link_ids)?;
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::bad_request("Collection name is required"));
    }
    let color = body
        .color
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(ref c) = color {
        if !collection_hex_ok(c) {
            return Err(AppError::bad_request(
                "color must be a hex code like #3B82F6",
            ));
        }
    }

    let collection_id = new_cuid();
    sqlx::query(
        r#"INSERT INTO collections (id, name, description, color, owner_id, archived_at, created_at, updated_at)
           VALUES ($1, $2, NULL, $3, $4, NULL, NOW(), NOW())"#,
    )
    .bind(&collection_id)
    .bind(&name)
    .bind(&color)
    .bind(&user.id)
    .execute(&state.pool)
    .await?;

    let mut added = 0i64;
    for link_id in &link_ids {
        if !user_can_reference_link(&state.pool, &user.id, link_id).await? {
            continue;
        }
        let lc_id = new_cuid();
        let res = sqlx::query(
            "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
        )
        .bind(&lc_id)
        .bind(link_id)
        .bind(&collection_id)
        .execute(&state.pool)
        .await?;
        added += res.rows_affected() as i64;
    }

    write_bulk_audit(
        &state.pool,
        &user.id,
        "links.bulk.create_collection",
        &link_ids,
        &headers,
        Some(json!({
            "collectionId": collection_id,
            "name": name,
            "added": added
        })),
    );

    Ok(Json(json!({
        "success": true,
        "collection_id": collection_id,
        "added": added
    })))
}
