use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::models::link::*;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/links", get(list_links).post(create_link))
        .route("/links/{id}", put(update_link).delete(delete_link))
        .route("/links/metadata", post(extract_metadata))
}

async fn list_links(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<LinkListParams>,
) -> Result<Json<LinkListResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).min(100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;
    let archive = params.archive.as_deref().unwrap_or("unarchived");
    let is_fav = params.is_favorite.clone();
    let collection_id = params.collection_id.clone();

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM links
           WHERE user_id = $1
             AND (($2 = 'archived' AND archived_at IS NOT NULL) OR ($2 != 'archived' AND archived_at IS NULL))
             AND ($3::text IS NULL OR (is_favorite = ($3 = 'true')))
             AND ($4::text IS NULL OR id IN (SELECT link_id FROM link_collections WHERE collection_id = $4))"#,
    )
    .bind(&user.id)
    .bind(archive)
    .bind(&is_fav)
    .bind(&collection_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let rows = sqlx::query(
        r#"SELECT id, title, url, normalized_url, description, favicon,
                  link_type::text as link_type, tags, notes, is_favorite, rating,
                  metadata, metadata_extracted_at, user_id, archived_at, created_at, updated_at
           FROM links
           WHERE user_id = $1
             AND (($2 = 'archived' AND archived_at IS NOT NULL) OR ($2 != 'archived' AND archived_at IS NULL))
             AND ($3::text IS NULL OR (is_favorite = ($3 = 'true')))
             AND ($4::text IS NULL OR id IN (SELECT link_id FROM link_collections WHERE collection_id = $4))
           ORDER BY created_at DESC
           LIMIT $5 OFFSET $6"#,
    )
    .bind(&user.id)
    .bind(archive)
    .bind(&is_fav)
    .bind(&collection_id)
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

async fn create_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateLinkRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if body.url.trim().is_empty() {
        return Err(AppError::bad_request("URL is required"));
    }

    let id = crate::id::new_cuid();
    let title = body.title.unwrap_or_else(|| body.url.clone());
    let link_type = body.link_type.as_deref().unwrap_or("WEBSITE");
    let tags = body.tags.unwrap_or_default();
    let is_favorite = body.is_favorite.unwrap_or(false);
    let normalized = normalize_url(&body.url);

    sqlx::query(
        r#"INSERT INTO links (id, title, url, normalized_url, description, link_type, tags,
                              notes, is_favorite, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::"LinkType", $7, $8, $9, $10, NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&title)
    .bind(&body.url)
    .bind(&normalized)
    .bind(&body.description)
    .bind(link_type)
    .bind(&tags)
    .bind(&body.notes)
    .bind(is_favorite)
    .bind(&user.id)
    .execute(&state.pool)
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
            .execute(&state.pool)
            .await;
        }
    }

    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": id }))))
}

async fn update_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateLinkRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = sqlx::query("SELECT id, user_id FROM links WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Link not found"))?;

    let owner: String = existing.get("user_id");
    if owner != user.id {
        return Err(AppError::forbidden("Not your link"));
    }

    if let Some(ref title) = body.title {
        sqlx::query("UPDATE links SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(&id)
            .execute(&state.pool)
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
        .execute(&state.pool)
        .await?;
    }
    if let Some(ref desc) = body.description {
        sqlx::query("UPDATE links SET description = $1, updated_at = NOW() WHERE id = $2")
            .bind(desc)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref tags) = body.tags {
        sqlx::query("UPDATE links SET tags = $1, updated_at = NOW() WHERE id = $2")
            .bind(tags)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(is_fav) = body.is_favorite {
        sqlx::query("UPDATE links SET is_favorite = $1, updated_at = NOW() WHERE id = $2")
            .bind(is_fav)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(ref archived) = body.archived_at {
        if archived.is_null() {
            sqlx::query("UPDATE links SET archived_at = NULL, updated_at = NOW() WHERE id = $1")
                .bind(&id)
                .execute(&state.pool)
                .await?;
        } else {
            sqlx::query("UPDATE links SET archived_at = NOW(), updated_at = NOW() WHERE id = $1")
                .bind(&id)
                .execute(&state.pool)
                .await?;
        }
    }

    if let Some(ref collection_ids) = body.collection_ids {
        sqlx::query("DELETE FROM link_collections WHERE link_id = $1")
            .bind(&id)
            .execute(&state.pool)
            .await?;
        for cid in collection_ids {
            let lc_id = crate::id::new_cuid();
            let _ = sqlx::query(
                "INSERT INTO link_collections (id, link_id, collection_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING",
            )
            .bind(&lc_id)
            .bind(&id)
            .bind(cid)
            .execute(&state.pool)
            .await;
        }
    }

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Link updated" }),
    ))
}

async fn delete_link(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = sqlx::query("SELECT id, user_id FROM links WHERE id = $1")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::not_found("Link not found"))?;

    let owner: String = existing.get("user_id");
    if owner != user.id {
        return Err(AppError::forbidden("Not your link"));
    }

    sqlx::query("DELETE FROM links WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Link deleted" }),
    ))
}

async fn extract_metadata(
    State(_state): State<AppState>,
    AuthUser(_user): AuthUser,
    Json(body): Json<ExtractMetadataRequest>,
) -> Result<Json<ExtractMetadataResponse>, AppError> {
    let url_str = body.url.trim().to_string();
    if url_str.is_empty() {
        return Err(AppError::bad_request("URL is required"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| AppError::internal("Failed to create HTTP client"))?;

    let resp = client
        .get(&url_str)
        .header("User-Agent", "CloudWrkz/1.0 Link Preview")
        .send()
        .await
        .map_err(|_| AppError::bad_request("Failed to fetch URL"))?;

    let html = resp
        .text()
        .await
        .map_err(|_| AppError::bad_request("Failed to read response"))?;

    let doc = scraper::Html::parse_document(&html);

    let title =
        extract_meta(&doc, "og:title").or_else(|| extract_tag_text(&doc, "title"));
    let description =
        extract_meta(&doc, "og:description").or_else(|| extract_meta(&doc, "description"));
    let favicon = extract_favicon(&doc, &url_str);

    Ok(Json(ExtractMetadataResponse {
        title,
        description,
        favicon,
    }))
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
