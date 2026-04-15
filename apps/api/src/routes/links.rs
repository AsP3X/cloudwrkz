use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::github_metadata;
use crate::command_queue::{
    apply_mutation_tx_settings, mutation_response, run_mutation_defer, JsonMutationResult,
    MutationHandlerOutput, MutationRunContext,
};
use crate::error::AppError;
use crate::models::link::*;
use crate::routes::helpers::{hash_json_for_idempotency, idempotency_key_from_headers};
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/links", get(list_links).post(create_link))
        .route("/links/{id}", get(get_link).put(update_link).delete(delete_link))
        .route("/links/metadata", post(extract_metadata))
        // Backwards compatible alias used by the Vite frontend.
        .route("/links/extract-metadata", post(extract_metadata))
        .route("/links/tag-suggestions", get(tag_suggestions))
        .route(
            "/links/{id}/github-metadata/refresh",
            post(enqueue_github_metadata_refresh),
        )
}

async fn list_links(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<LinkListParams>,
) -> Result<Json<LinkListResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).min(100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;
    let archived = params.archive.as_deref().unwrap_or("false");
    let is_fav = params.is_favorite.clone().filter(|s| !s.trim().is_empty());
    let collection_id = params.collection_id.clone().filter(|s| !s.trim().is_empty());
    let link_type = params.link_type.clone().filter(|s| !s.trim().is_empty());
    let search = params.search.clone().filter(|s| !s.trim().is_empty());
    let min_rating = params.min_rating;

    let order_by = match params.sort.as_deref().unwrap_or("createdAt-desc") {
        "createdAt-asc" => "l.created_at ASC",
        "createdAt-desc" => "l.created_at DESC",
        "updatedAt-desc" => "l.updated_at DESC",
        "updatedAt-asc" => "l.updated_at ASC",
        "title-asc" => "l.title ASC",
        "title-desc" => "l.title DESC",
        "rating-desc" => "l.rating DESC NULLS LAST",
        "rating-asc" => "l.rating ASC NULLS LAST",
        _ => "l.created_at DESC",
    };

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM links l
           WHERE l.user_id = $1
             AND (($2 = 'true' AND l.archived_at IS NOT NULL) OR ($2 != 'true' AND l.archived_at IS NULL))
             AND ($3::text IS NULL OR (l.is_favorite = ($3 = 'true')))
             AND ($4::text IS NULL OR l.id IN (SELECT link_id FROM link_collections WHERE collection_id = $4))
             AND ($5::text IS NULL OR l.link_type = $5::"LinkType")
             AND ($6::text IS NULL OR (
                l.title ILIKE '%' || $6 || '%' OR
                l.url ILIKE '%' || $6 || '%' OR
                COALESCE(l.description, '') ILIKE '%' || $6 || '%' OR
                COALESCE(l.notes, '') ILIKE '%' || $6 || '%'
             ))
             AND ($7::int IS NULL OR l.rating >= $7)"#,
    )
    .bind(&user.id)
    .bind(archived)
    .bind(&is_fav)
    .bind(&collection_id)
    .bind(&link_type)
    .bind(&search)
    .bind(min_rating)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let rows = sqlx::query(&format!(
        r#"SELECT l.id, l.title, l.url, l.normalized_url, l.description, l.favicon,
                  l.link_type::text as link_type, l.tags, l.notes, l.is_favorite, l.rating,
                  l.metadata, l.metadata_extracted_at, l.user_id, l.archived_at, l.created_at, l.updated_at,
                  COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'collection', json_build_object(
                            'id', c.id,
                            'name', c.name,
                            'color', c.color
                          )
                        )
                      )
                      FROM link_collections lc
                      JOIN collections c ON c.id = lc.collection_id
                      WHERE lc.link_id = l.id
                    ),
                    '[]'::json
                  ) as collections
           FROM links l
           WHERE l.user_id = $1
             AND (($2 = 'true' AND l.archived_at IS NOT NULL) OR ($2 != 'true' AND l.archived_at IS NULL))
             AND ($3::text IS NULL OR (l.is_favorite = ($3 = 'true')))
             AND ($4::text IS NULL OR l.id IN (SELECT link_id FROM link_collections WHERE collection_id = $4))
             AND ($5::text IS NULL OR l.link_type = $5::"LinkType")
             AND ($6::text IS NULL OR (
                l.title ILIKE '%' || $6 || '%' OR
                l.url ILIKE '%' || $6 || '%' OR
                COALESCE(l.description, '') ILIKE '%' || $6 || '%' OR
                COALESCE(l.notes, '') ILIKE '%' || $6 || '%'
             ))
             AND ($7::int IS NULL OR l.rating >= $7)
           ORDER BY {order_by}
           LIMIT $8 OFFSET $9"#,
    ))
    .bind(&user.id)
    .bind(archived)
    .bind(&is_fav)
    .bind(&collection_id)
    .bind(&link_type)
    .bind(&search)
    .bind(min_rating)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let links: Vec<LinkRow> = rows
        .iter()
        .map(|r| LinkRow {
            id: r.get("id"),
            title: r.get("title"),
            url: r.get("url"),
            normalized_url: r.get("normalized_url"),
            description: r.get("description"),
            favicon: r.get("favicon"),
            link_type: r.get("link_type"),
            tags: r.get("tags"),
            notes: r.get("notes"),
            is_favorite: r.get("is_favorite"),
            rating: r.get("rating"),
            metadata: r.get("metadata"),
            metadata_extracted_at: r.get("metadata_extracted_at"),
            user_id: r.get("user_id"),
            archived_at: r.get("archived_at"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
            collections: r.get("collections"),
        })
        .collect();

    let total_pages = if total == 0 {
        1
    } else {
        (total + limit - 1) / limit
    };

    Ok(Json(LinkListResponse {
        links,
        total,
        page,
        limit,
        total_pages,
    }))
}

#[derive(Debug, Deserialize)]
struct TagSuggestionsQuery {
    q: String,
}

async fn tag_suggestions(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<TagSuggestionsQuery>,
) -> Result<Json<Vec<String>>, AppError> {
    let q = params.q.trim().to_lowercase();
    if q.is_empty() {
        return Ok(Json(vec![]));
    }

    let rows = sqlx::query("SELECT DISTINCT unnest(tags) as tag FROM links WHERE user_id = $1")
        .bind(&user.id)
        .fetch_all(&state.pool)
        .await?;

    let mut unique_tags = std::collections::HashSet::<String>::new();
    for r in rows {
        let tag: Option<String> = r.get("tag");
        if let Some(tag) = tag {
            let trimmed = tag.trim();
            if !trimmed.is_empty() {
                unique_tags.insert(trimmed.to_string());
            }
        }
    }

    let mut filtered: Vec<String> = unique_tags
        .into_iter()
        .filter(|tag| tag.to_lowercase().contains(&q))
        .collect();

    // Prefer tags that start with the query (same behavior as legacy Next UI).
    filtered.sort_by(|a, b| {
        let a_lower = a.to_lowercase();
        let b_lower = b.to_lowercase();
        let a_starts = a_lower.starts_with(&q);
        let b_starts = b_lower.starts_with(&q);

        match (a_starts, b_starts) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a_lower.cmp(&b_lower),
        }
    });

    filtered.truncate(15);
    Ok(Json(filtered))
}

async fn get_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query(
        r#"SELECT l.id, l.title, l.url, l.normalized_url, l.description, l.favicon,
                  l.link_type::text as link_type, l.tags, l.notes, l.is_favorite, l.rating,
                  l.metadata, l.metadata_extracted_at, l.user_id, l.archived_at, l.created_at, l.updated_at,
                  COALESCE(
                    (
                      SELECT json_agg(
                        json_build_object(
                          'collection', json_build_object(
                            'id', c.id,
                            'name', c.name,
                            'color', c.color
                          )
                        )
                      )
                      FROM link_collections lc
                      JOIN collections c ON c.id = lc.collection_id
                      WHERE lc.link_id = l.id
                    ),
                    '[]'::json
                  ) as collections
           FROM links l
           WHERE l.user_id = $1
             AND l.id = $2"#,
    )
    .bind(&user.id)
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(r) = row else {
        return Err(AppError::not_found("Link not found"));
    };

    let link = LinkRow {
        id: r.get("id"),
        title: r.get("title"),
        url: r.get("url"),
        normalized_url: r.get("normalized_url"),
        description: r.get("description"),
        favicon: r.get("favicon"),
        link_type: r.get("link_type"),
        tags: r.get("tags"),
        notes: r.get("notes"),
        is_favorite: r.get("is_favorite"),
        rating: r.get("rating"),
        metadata: r.get("metadata"),
        metadata_extracted_at: r.get("metadata_extracted_at"),
        user_id: r.get("user_id"),
        archived_at: r.get("archived_at"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
        collections: r.get("collections"),
    };

    Ok(Json(serde_json::json!({ "link": link })))
}

async fn enqueue_github_metadata_refresh(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owns: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM links WHERE id = $1 AND user_id = $2)",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_one(&state.pool)
    .await?;

    if !owns {
        return Err(AppError::not_found("Link not found"));
    }

    let (job_id, already_queued) =
        github_metadata::enqueue_github_metadata_job(&state.pool, &id, &user.id).await?;

    Ok(Json(serde_json::json!({
        "jobId": job_id,
        "alreadyQueued": already_queued,
    })))
}

async fn create_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<CreateLinkRequest>,
) -> Result<Response, AppError> {
    if body.url.trim().is_empty() {
        return Err(AppError::bad_request("URL is required"));
    }

    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /links".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let uid = user.id.clone();
    let shard = format!("link:create:{uid}");
    let b = body.clone();
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let user_id = uid.clone();
        let body = b.clone();
        move || {
            let user_id = user_id.clone();
            let body = body.clone();
            move |pool: sqlx::PgPool| async move {
                let allow_duplicates = body.allow_duplicates.unwrap_or(false);
                let should_extract = body.extract_metadata.unwrap_or(false)
                    || body.title.is_none()
                    || body.description.is_none();

                let id = crate::id::new_cuid();
                let normalized = normalize_url(&body.url);
                let mut title = body.title.clone();
                let mut description = body.description.clone();
                let mut favicon: Option<String> = None;
                let mut metadata: Option<serde_json::Value> = None;
                let mut metadata_extracted_at: Option<chrono::NaiveDateTime> = None;

                if should_extract {
                    if let Ok(extracted) = extract_metadata_from_url(&body.url).await {
                        let extracted_title = extracted.title.clone();
                        let extracted_description = extracted.description.clone();
                        let extracted_favicon = extracted.favicon.clone();

                        if title.is_none() {
                            title = extracted_title.clone();
                        }
                        if description.is_none() {
                            description = extracted_description.clone();
                        }
                        favicon = extracted_favicon.clone();
                        metadata_extracted_at = Some(chrono::Utc::now().naive_utc());
                        metadata = Some(serde_json::json!({
                            "title": extracted_title,
                            "description": extracted_description,
                            "favicon": extracted_favicon,
                        }));
                    }
                }

                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                if !allow_duplicates {
                    let exact_duplicate_ids = sqlx::query_scalar::<_, String>(
                        "SELECT id FROM links WHERE user_id = $1 AND normalized_url = $2",
                    )
                    .bind(&user_id)
                    .bind(&normalized)
                    .fetch_all(&mut *tx)
                    .await?;

                    if !exact_duplicate_ids.is_empty() {
                        let host = normalized.split('/').next().unwrap_or_default().to_string();
                        let similar_link_ids = sqlx::query_scalar::<_, String>(
                            r#"SELECT id
                   FROM links
                   WHERE user_id = $1
                     AND split_part(normalized_url, '/', 1) = $2
                     AND normalized_url <> $3"#,
                        )
                        .bind(&user_id)
                        .bind(&host)
                        .bind(&normalized)
                        .fetch_all(&mut *tx)
                        .await?;
                        drop(tx);
                        return Ok(JsonMutationResult::new(
                            StatusCode::OK,
                            serde_json::json!({
                                "success": false,
                                "error": "A link with this exact URL already exists",
                                "duplicate_link_ids": exact_duplicate_ids,
                                "similar_link_ids": similar_link_ids,
                            }),
                        ));
                    }
                }

                let link_type = body.link_type.as_deref().unwrap_or("WEBSITE");
                let tags = body.tags.clone().unwrap_or_default();
                let is_favorite = body.is_favorite.unwrap_or(false);
                let title = title.unwrap_or_else(|| body.url.clone());

                sqlx::query(
                    r#"INSERT INTO links (id, title, url, normalized_url, description, favicon, link_type, tags,
                              notes, is_favorite, metadata, metadata_extracted_at, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::"LinkType", $8, $9, $10, $11, $12, $13, NOW(), NOW())"#,
                )
                .bind(&id)
                .bind(&title)
                .bind(&body.url)
                .bind(&normalized)
                .bind(&description)
                .bind(&favicon)
                .bind(link_type)
                .bind(&tags)
                .bind(&body.notes)
                .bind(is_favorite)
                .bind(&metadata)
                .bind(metadata_extracted_at)
                .bind(&user_id)
                .execute(&mut *tx)
                .await?;

                if let Some(ref collection_ids) = body.collection_ids {
                    for cid in collection_ids {
                        let lc_id = crate::id::new_cuid();
                        let _ = sqlx::query(
                "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
            )
                        .bind(&lc_id)
                        .bind(&id)
                        .bind(cid)
                        .execute(&mut *tx)
                        .await;
                    }
                }

                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::created(serde_json::json!({ "id": id })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn update_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateLinkRequest>,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PUT /links/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route,
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let b = body.clone();
    let shard = format!("link:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let user_id = uid.clone();
        let body = b.clone();
        move || {
            let id = id.clone();
            let user_id = user_id.clone();
            let body = body.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                let existing = sqlx::query(
                    "SELECT id, user_id FROM links WHERE id = $1 FOR UPDATE",
                )
                .bind(&id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::not_found("Link not found"))?;

                let owner: String = existing.get("user_id");
                if owner != user_id {
                    return Err(AppError::forbidden("Not your link"));
                }

                if let Some(ref title) = body.title {
                    sqlx::query("UPDATE links SET title = $1, updated_at = NOW() WHERE id = $2")
                        .bind(title)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref url) = body.url {
                    let normalized = normalize_url(url);
                    sqlx::query(
                        "UPDATE links SET url = $1, normalized_url = $2, updated_at = NOW() WHERE id = $3",
                    )
                    .bind(url)
                    .bind(&normalized)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref desc) = body.description {
                    sqlx::query("UPDATE links SET description = $1, updated_at = NOW() WHERE id = $2")
                        .bind(desc)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref tags) = body.tags {
                    sqlx::query("UPDATE links SET tags = $1, updated_at = NOW() WHERE id = $2")
                        .bind(tags)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(is_fav) = body.is_favorite {
                    sqlx::query(
                        "UPDATE links SET is_favorite = $1, updated_at = NOW() WHERE id = $2",
                    )
                    .bind(is_fav)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref archived) = body.archived_at {
                    if archived.is_null() {
                        sqlx::query(
                            "UPDATE links SET archived_at = NULL, updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    } else {
                        sqlx::query(
                            "UPDATE links SET archived_at = NOW(), updated_at = NOW() WHERE id = $1",
                        )
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    }
                }
                if let Some(ref notes) = body.notes {
                    sqlx::query("UPDATE links SET notes = $1, updated_at = NOW() WHERE id = $2")
                        .bind(notes)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(ref link_type) = body.link_type {
                    sqlx::query(
                        "UPDATE links SET link_type = $1::\"LinkType\", updated_at = NOW() WHERE id = $2",
                    )
                    .bind(link_type)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                }
                if let Some(ref rating) = body.rating {
                    sqlx::query("UPDATE links SET rating = $1, updated_at = NOW() WHERE id = $2")
                        .bind(rating)
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                }

                if let Some(ref collection_ids) = body.collection_ids {
                    sqlx::query("DELETE FROM link_collections WHERE link_id = $1")
                        .bind(&id)
                        .execute(&mut *tx)
                        .await?;
                    for cid in collection_ids {
                        let lc_id = crate::id::new_cuid();
                        let _ = sqlx::query(
                "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
            )
                        .bind(&lc_id)
                        .bind(&id)
                        .bind(cid)
                        .execute(&mut *tx)
                        .await;
                    }
                }

                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({
                    "success": true,
                    "message": "Link updated"
                })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn delete_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: format!("DELETE /links/{id}"),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    let id_clone = id.clone();
    let uid = user.id.clone();
    let shard = format!("link:{id}");
    let broker = state.mutation_broker.clone();
    let lock_ms = broker.lock_timeout_ms;
    let stmt_ms = broker.statement_timeout_ms;
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let id = id_clone.clone();
        let user_id = uid.clone();
        move || {
            let id = id.clone();
            let user_id = user_id.clone();
            move |pool: sqlx::PgPool| async move {
                let mut tx = pool.begin().await.map_err(AppError::from)?;
                apply_mutation_tx_settings(&mut tx, lock_ms, stmt_ms)
                    .await
                    .map_err(AppError::from)?;

                let existing = sqlx::query(
                    "SELECT id, user_id FROM links WHERE id = $1 FOR UPDATE",
                )
                .bind(&id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::not_found("Link not found"))?;

                let owner: String = existing.get("user_id");
                if owner != user_id {
                    return Err(AppError::forbidden("Not your link"));
                }

                sqlx::query("DELETE FROM links WHERE id = $1")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                tx.commit().await.map_err(AppError::from)?;
                Ok(JsonMutationResult::ok(serde_json::json!({
                    "success": true,
                    "message": "Link deleted"
                })))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    Ok(mutation_response(out))
}

async fn extract_metadata(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<ExtractMetadataRequest>,
) -> Result<Response, AppError> {
    let url_str = body.url.trim().to_string();
    if url_str.is_empty() {
        return Err(AppError::bad_request("URL is required"));
    }
    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /links/metadata".into(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let shard = format!("link:metadata:{}", user.id);
    let broker = state.mutation_broker.clone();
    let pool = state.pool.clone();
    let jobs = state.mutation_jobs.clone();
    let make_arc = Arc::new(tokio::sync::Mutex::new({
        let url_str = url_str.clone();
        move || {
            let url_str = url_str.clone();
            move |_pool: sqlx::PgPool| async move {
                let extracted = extract_metadata_from_url(&url_str).await?;
                let body = serde_json::to_value(&extracted).map_err(|e| {
                    AppError::internal(format!("serialize extract metadata: {e}"))
                })?;
                Ok(JsonMutationResult::ok(body))
            }
        }
    }));
    let out = run_mutation_defer(
        broker,
        pool,
        shard,
        ctx,
        jobs,
        user.id.clone(),
        make_arc,
    )
    .await?;
    match out {
        MutationHandlerOutput::Ready(jr) => {
            let extracted: ExtractMetadataResponse = serde_json::from_value(jr.body)
                .map_err(|_| AppError::internal("invalid extract payload"))?;
            Ok(Json(extracted).into_response())
        }
        MutationHandlerOutput::Queued(q) => Ok((StatusCode::ACCEPTED, Json(q)).into_response()),
    }
}

async fn extract_metadata_from_url(url_str: &str) -> Result<ExtractMetadataResponse, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| AppError::internal("Failed to create HTTP client"))?;

    let resp = client
        .get(url_str)
        .header("User-Agent", "CloudWrkz/1.0 Link Preview")
        .send()
        .await
        .map_err(|_| AppError::bad_request("Failed to fetch URL"))?;

    let html = resp
        .text()
        .await
        .map_err(|_| AppError::bad_request("Failed to read response"))?;

    let doc = scraper::Html::parse_document(&html);

    let title = extract_meta(&doc, "og:title").or_else(|| extract_tag_text(&doc, "title"));
    let description =
        extract_meta(&doc, "og:description").or_else(|| extract_meta(&doc, "description"));
    let favicon = extract_favicon(&doc, url_str);

    Ok(ExtractMetadataResponse {
        title,
        description,
        favicon,
    })
}

fn extract_meta(doc: &scraper::Html, name: &str) -> Option<String> {
    let sel_str = format!(r#"meta[property="{name}"], meta[name="{name}"]"#);
    let selector = scraper::Selector::parse(&sel_str).ok()?;
    doc.select(&selector)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string())
}

fn extract_tag_text(doc: &scraper::Html, tag: &str) -> Option<String> {
    let selector = scraper::Selector::parse(tag).ok()?;
    doc.select(&selector)
        .next()
        .map(|el| el.text().collect::<String>())
}

fn extract_favicon(doc: &scraper::Html, base_url: &str) -> Option<String> {
    let selector =
        scraper::Selector::parse(r#"link[rel="icon"], link[rel="shortcut icon"]"#).ok()?;
    if let Some(el) = doc.select(&selector).next() {
        if let Some(href) = el.value().attr("href") {
            if href.starts_with("http") {
                return Some(href.to_string());
            }
            if let Ok(base) = url::Url::parse(base_url) {
                return base.join(href).ok().map(|u| u.to_string());
            }
        }
    }
    url::Url::parse(base_url)
        .ok()
        .and_then(|u| u.join("/favicon.ico").ok())
        .map(|u| u.to_string())
}

fn normalize_url(url: &str) -> String {
    let mut s = url.to_lowercase();
    s = s
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.")
        .trim_end_matches('/')
        .to_string();
    s
}
