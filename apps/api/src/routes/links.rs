//! Bookmark links: list/create/update/delete, HTML metadata extraction, tag suggestions, GitHub metadata refresh jobs.

// Human: Writes often go through `run_mutation_defer` so transient DB errors become 202 + mutation job polling like other heavy modules.
// Agent: router /links* + metadata routes; entity_creates for async creates/updates/deletes; link_preview extract_metadata; job_queue enqueue github refresh.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::command_queue::{
    JsonMutationResult, MutationHandlerOutput, MutationQueuedResponse, MutationRunContext,
    run_mutation_defer,
};
use crate::error::AppError;
use crate::job_queue;
use crate::job_queue::entity_creates;
use crate::link_preview;
use crate::models::link::*;
use crate::routes::AppState;
use crate::routes::helpers::{
    attach_audit_to_job_payload, hash_json_for_idempotency, idempotency_key_from_headers,
    require_links_read, require_permission,
};

// Human: Routes stay backward compatible by keeping both `/links/metadata` and the older `/links/extract-metadata` alias used by the Vite client.
// Agent: Router GET list POST create; PUT/PATCH/DELETE by id; POST metadata x2; GET tag-suggestions; POST github-metadata refresh.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/links", get(list_links).post(create_link))
        .route(
            "/links/{id}",
            get(get_link).put(update_link).delete(delete_link),
        )
        .route("/links/metadata", post(extract_metadata))
        // Backwards compatible alias used by the Vite frontend.
        .route("/links/extract-metadata", post(extract_metadata))
        .route("/links/tag-suggestions", get(tag_suggestions))
        .route(
            "/links/{id}/github-metadata/refresh",
            post(enqueue_github_metadata_refresh),
        )
        .route(
            "/links/{id}/website-metadata/refresh",
            post(enqueue_website_metadata_refresh),
        )
}

async fn list_links(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<LinkListParams>,
) -> Result<Json<LinkListResponse>, AppError> {
    let archived = params.archive.as_deref().unwrap_or("false");
    require_links_read(&state.pool, &user.id, archived == "true").await?;

    let limit = params.limit.unwrap_or(20).min(100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;
    let is_fav = params.is_favorite.clone().filter(|s| !s.trim().is_empty());
    let collection_id = params
        .collection_id
        .clone()
        .filter(|s| !s.trim().is_empty());
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
    require_permission(&state.pool, &user.id, "links.view").await?;
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
    require_permission(&state.pool, &user.id, "links.view").await?;
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

    let archived_at: Option<chrono::NaiveDateTime> = r.get("archived_at");
    if archived_at.is_some() {
        require_permission(&state.pool, &user.id, "links.archive").await?;
    }

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
    require_permission(&state.pool, &user.id, "links.update").await?;
    let owns: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM links WHERE id = $1 AND user_id = $2)")
            .bind(&id)
            .bind(&user.id)
            .fetch_one(&state.pool)
            .await?;

    if !owns {
        return Err(AppError::not_found("Link not found"));
    }

    let (job_id, already_queued) =
        job_queue::enqueue_github_link_metadata_job(&state.pool, &id, &user.id).await?;

    Ok(Json(serde_json::json!({
        "jobId": job_id,
        "alreadyQueued": already_queued,
    })))
}

// Human: Owners can re-queue a background HTML scrape (robots.txt + Open Graph) for non-GitHub bookmarks.
// Agent: REQUIRES links.update + ownership; CALLS enqueue_website_link_metadata_job; RETURNS jobId alreadyQueued.

async fn enqueue_website_metadata_refresh(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "links.update").await?;
    let owns: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM links WHERE id = $1 AND user_id = $2)")
            .bind(&id)
            .bind(&user.id)
            .fetch_one(&state.pool)
            .await?;

    if !owns {
        return Err(AppError::not_found("Link not found"));
    }

    let (job_id, already_queued) =
        job_queue::enqueue_website_link_metadata_job(&state.pool, &id, &user.id).await?;

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
    require_permission(&state.pool, &user.id, "links.create").await?;
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
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize link create: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_LINK_CREATE,
        &user.id,
        attach_audit_to_job_payload(job_payload, &headers),
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Link creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_LINK_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn update_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateLinkRequest>,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &user.id, "links.update").await?;
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PUT /links/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: route.clone(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize link update: {e}")))?;
    let job_payload = json!({
        "user_id": user.id,
        "link_id": id,
        "route": route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_LINK_UPDATE,
        &user.id,
        attach_audit_to_job_payload(job_payload, &headers),
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Link update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_LINK_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &user.id, "links.delete").await?;
    let route = format!("DELETE /links/{id}");
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: route.clone(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash: 0,
    };
    if let Some(ref ik) = ctx.idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(&ctx.user_id, ik, &ctx.route, ctx.body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }

    let job_payload = json!({
        "user_id": user.id,
        "link_id": id,
        "route": route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_LINK_DELETE,
        &user.id,
        attach_audit_to_job_payload(job_payload, &headers),
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Link deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_LINK_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn extract_metadata(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<ExtractMetadataRequest>,
) -> Result<Response, AppError> {
    require_permission(&state.pool, &user.id, "links.create").await?;
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
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(10))
                    .build()
                    .map_err(|_| AppError::internal("Failed to create HTTP client"))?;
                let extracted = link_preview::extract_metadata_from_url(&client, &url_str).await?;
                let body = serde_json::to_value(&extracted)
                    .map_err(|e| AppError::internal(format!("serialize extract metadata: {e}")))?;
                Ok(JsonMutationResult::ok(body))
            }
        }
    }));
    let out = run_mutation_defer(broker, pool, shard, ctx, jobs, user.id.clone(), make_arc).await?;
    match out {
        MutationHandlerOutput::Ready(jr) => {
            let extracted: ExtractMetadataResponse = serde_json::from_value(jr.body)
                .map_err(|_| AppError::internal("invalid extract payload"))?;
            Ok(Json(extracted).into_response())
        }
        MutationHandlerOutput::Queued(q) => Ok((StatusCode::ACCEPTED, Json(q)).into_response()),
    }
}
