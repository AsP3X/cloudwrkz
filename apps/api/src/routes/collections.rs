use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use crate::audit;
use crate::auth::extractors::AuthUser;
use crate::command_queue::{MutationQueuedResponse, MutationRunContext};
use crate::error::AppError;
use crate::job_queue::entity_creates;
use crate::models::link::LinkRow;
use crate::routes::AppState;
use crate::routes::helpers::{
    check_permission, hash_json_for_idempotency, idempotency_key_from_headers,
};

fn is_hex_color(value: &str) -> bool {
    let b = value.as_bytes();
    b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|x| x.is_ascii_hexdigit())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/collections/{id}/members/{member_user_id}",
            delete(remove_member).patch(update_member_role),
        )
        .route("/collections/{id}/members", post(add_member))
        .route("/collections/{id}/leave", post(leave_collection))
        .route(
            "/collections/{id}",
            get(get_collection)
                .put(update_collection)
                .delete(delete_collection),
        )
        .route(
            "/collections",
            get(list_collections).post(create_collection),
        )
}

async fn ensure_collection_access(
    pool: &sqlx::PgPool,
    user_id: &str,
    collection_id: &str,
) -> Result<(String, bool), AppError> {
    let row = sqlx::query(
        r#"SELECT c.owner_id,
                  EXISTS(SELECT 1 FROM collection_members cm WHERE cm.collection_id = c.id AND cm.user_id = $2) as is_member
           FROM collections c
           WHERE c.id = $1 AND c.archived_at IS NULL"#,
    )
    .bind(collection_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Err(AppError::not_found("Collection not found"));
    };

    let owner_id: String = row.get("owner_id");
    let is_member: bool = row.get("is_member");
    let is_owner = owner_id == user_id;
    if !is_owner && !is_member {
        return Err(AppError::forbidden(
            "You don't have access to this collection",
        ));
    }
    Ok((owner_id, is_owner))
}

async fn is_editor_or_owner(
    pool: &sqlx::PgPool,
    user_id: &str,
    collection_id: &str,
    owner_id: &str,
) -> Result<bool, AppError> {
    if owner_id == user_id {
        return Ok(true);
    }
    let role: Option<String> = sqlx::query_scalar(
        r#"SELECT role::text FROM collection_members
           WHERE collection_id = $1 AND user_id = $2"#,
    )
    .bind(collection_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(matches!(role.as_deref(), Some("EDITOR")))
}

async fn list_collections(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.view").await {
        return Err(AppError::forbidden(
            "You don't have permission to view collections",
        ));
    }

    let rows = sqlx::query(
        r#"SELECT c.id, c.name, c.description, c.color, c.owner_id,
                  c.archived_at, c.created_at, c.updated_at,
                  (SELECT COUNT(*)::bigint FROM link_collections lc WHERE lc.collection_id = c.id) as link_count,
                  u.name as owner_name, u.email as owner_email
           FROM collections c
           JOIN users u ON u.id = c.owner_id
           WHERE c.archived_at IS NULL
             AND (c.owner_id = $1 OR c.id IN (SELECT collection_id FROM collection_members WHERE user_id = $1))
           ORDER BY c.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.pool)
    .await?;

    let out: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let owner_name: Option<String> = r.get("owner_name");
            let owner_email: String = r.get("owner_email");
            let owner_id: String = r.get("owner_id");
            json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "color": r.get::<Option<String>, _>("color"),
                "owner_id": owner_id,
                "archived_at": r.get::<Option<chrono::NaiveDateTime>, _>("archived_at"),
                "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": r.get::<chrono::NaiveDateTime, _>("updated_at"),
                "link_count": r.get::<i64, _>("link_count"),
                "owner": {
                    "id": owner_id,
                    "name": owner_name,
                    "email": owner_email,
                }
            })
        })
        .collect();

    Ok(Json(json!({ "collections": out })))
}

#[derive(Debug, Deserialize, Serialize)]
struct CreateCollectionBody {
    name: String,
    description: Option<String>,
    color: Option<String>,
}

async fn create_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<CreateCollectionBody>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.create").await {
        return Err(AppError::forbidden(
            "You don't have permission to create collections",
        ));
    }

    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::bad_request("Collection name is required"));
    }

    if let Some(ref c) = body.color {
        let t = c.trim();
        if !t.is_empty() && !is_hex_color(t) {
            return Err(AppError::bad_request(
                "Invalid color format. Use a hex color code (e.g. #3B82F6)",
            ));
        }
    }

    let body_hash = hash_json_for_idempotency(&body);
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: "POST /collections".into(),
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
        .map_err(|e| AppError::internal(format!("serialize collection create: {e}")))?;
    let audit_ip = audit::client_ip_from_headers(&headers);
    let audit_ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let job_payload = json!({
        "user_id": user.id,
        "route": ctx.route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
        "audit_ip": audit_ip,
        "audit_user_agent": audit_ua,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_COLLECTION_CREATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Collection creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_COLLECTION_CREATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

#[derive(Debug, Deserialize, Serialize)]
struct UpdateCollectionBody {
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
}

async fn update_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateCollectionBody>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.update").await {
        return Err(AppError::forbidden(
            "You don't have permission to update collections",
        ));
    }

    let (owner_id, _) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if !is_editor_or_owner(&state.pool, &user.id, &id, &owner_id).await? {
        return Err(AppError::forbidden(
            "You don't have permission to update this collection",
        ));
    }

    if body.name.is_none() && body.description.is_none() && body.color.is_none() {
        return Err(AppError::bad_request("No fields to update"));
    }

    if let Some(ref n) = body.name {
        if n.trim().is_empty() {
            return Err(AppError::bad_request("Collection name cannot be empty"));
        }
    }

    if let Some(ref c) = body.color {
        let t = c.trim();
        if !t.is_empty() && !is_hex_color(t) {
            return Err(AppError::bad_request(
                "Invalid color format. Use a hex color code (e.g. #3B82F6)",
            ));
        }
    }

    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PUT /collections/{id}");
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
        .map_err(|e| AppError::internal(format!("serialize collection update: {e}")))?;
    let audit_ip = audit::client_ip_from_headers(&headers);
    let audit_ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let job_payload = json!({
        "user_id": user.id,
        "collection_id": id,
        "route": route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "request": request_json,
        "audit_ip": audit_ip,
        "audit_user_agent": audit_ua,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_COLLECTION_UPDATE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Collection update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_COLLECTION_UPDATE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn delete_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.delete").await {
        return Err(AppError::forbidden(
            "You don't have permission to delete collections",
        ));
    }

    let (owner_id, is_owner) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if !is_owner || owner_id != user.id {
        return Err(AppError::forbidden(
            "Only the collection owner can delete it",
        ));
    }

    let route = format!("DELETE /collections/{id}");
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

    let audit_ip = audit::client_ip_from_headers(&headers);
    let audit_ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let job_payload = json!({
        "user_id": user.id,
        "collection_id": id,
        "route": route,
        "body_hash": ctx.body_hash,
        "idempotency_key": ctx.idempotency_key,
        "audit_ip": audit_ip,
        "audit_user_agent": audit_ua,
    });
    let job_id = entity_creates::enqueue_entity_create_job(
        &state.pool,
        entity_creates::JOB_TYPE_COLLECTION_DELETE,
        &user.id,
        job_payload,
    )
    .await
    .map_err(AppError::from)?;

    let q = MutationQueuedResponse {
        message: "Collection deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed."
            .into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(entity_creates::JOB_TYPE_COLLECTION_DELETE.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn leave_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (owner_id, is_owner) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if is_owner && owner_id == user.id {
        return Err(AppError::bad_request(
            "Collection owner cannot leave; delete the collection instead",
        ));
    }

    let n =
        sqlx::query(r#"DELETE FROM collection_members WHERE collection_id = $1 AND user_id = $2"#)
            .bind(&id)
            .bind(&user.id)
            .execute(&state.pool)
            .await?
            .rows_affected();

    if n == 0 {
        return Err(AppError::not_found(
            "You are not a member of this collection",
        ));
    }

    Ok(Json(json!({ "success": true })))
}

async fn get_collection(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.view").await {
        return Err(AppError::forbidden(
            "You don't have permission to view collections",
        ));
    }

    let (owner_id, _) = ensure_collection_access(&state.pool, &user.id, &id).await?;

    let crow = sqlx::query(
        r#"SELECT c.id, c.name, c.description, c.color, c.owner_id, c.created_at, c.updated_at,
                  (SELECT COUNT(*)::bigint FROM link_collections lc WHERE lc.collection_id = c.id) as link_count,
                  u.name as owner_name, u.email as owner_email
           FROM collections c
           JOIN users u ON u.id = c.owner_id
           WHERE c.id = $1 AND c.archived_at IS NULL"#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::not_found("Collection not found"))?;

    let link_rows = sqlx::query(&format!(
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
           INNER JOIN link_collections j ON j.link_id = l.id AND j.collection_id = $2
           WHERE l.user_id = $1 AND l.archived_at IS NULL
           ORDER BY l.created_at DESC
           LIMIT 5000"#,
    ))
    .bind(&user.id)
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;

    let links: Vec<LinkRow> = link_rows
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

    let link_count: i64 = crow.get("link_count");
    let owner_name: Option<String> = crow.get("owner_name");
    let owner_email: String = crow.get("owner_email");

    let members_json = if owner_id == user.id {
        fetch_members_json(&state.pool, &id).await?
    } else {
        json!([])
    };

    Ok(Json(json!({
        "collection": {
            "id": crow.get::<String, _>("id"),
            "name": crow.get::<String, _>("name"),
            "description": crow.get::<Option<String>, _>("description"),
            "color": crow.get::<Option<String>, _>("color"),
            "owner_id": owner_id,
            "created_at": crow.get::<chrono::NaiveDateTime, _>("created_at"),
            "updated_at": crow.get::<chrono::NaiveDateTime, _>("updated_at"),
            "link_count": link_count,
            "_count": { "links": link_count },
            "owner": {
                "id": owner_id,
                "name": owner_name,
                "email": owner_email,
            },
            "links": links,
            "members": members_json,
        }
    })))
}

async fn fetch_members_json(
    pool: &sqlx::PgPool,
    collection_id: &str,
) -> Result<serde_json::Value, AppError> {
    let rows = sqlx::query(
        r#"SELECT cm.id, cm.user_id, cm.role::text as role,
                  u.id as u_id, u.name as u_name, u.email as u_email
           FROM collection_members cm
           JOIN users u ON u.id = cm.user_id
           WHERE cm.collection_id = $1
           ORDER BY cm.created_at ASC"#,
    )
    .bind(collection_id)
    .fetch_all(pool)
    .await?;

    let arr: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "user_id": r.get::<String, _>("user_id"),
                "role": r.get::<String, _>("role"),
                "user": {
                    "id": r.get::<String, _>("u_id"),
                    "name": r.get::<Option<String>, _>("u_name"),
                    "email": r.get::<String, _>("u_email"),
                }
            })
        })
        .collect();

    Ok(json!(arr))
}

#[derive(Debug, Deserialize)]
struct AddMemberBody {
    user_id: String,
    role: String,
}

async fn add_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<AddMemberBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.share").await {
        return Err(AppError::forbidden(
            "You don't have permission to share collections",
        ));
    }

    let (owner_id, _) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if owner_id != user.id {
        return Err(AppError::forbidden(
            "Only the collection owner can share it",
        ));
    }

    let target = body.user_id.trim();
    if target.is_empty() {
        return Err(AppError::bad_request("user_id is required"));
    }
    if target == user.id {
        return Err(AppError::bad_request(
            "Cannot share collection with yourself",
        ));
    }
    if target == owner_id {
        return Err(AppError::bad_request("Cannot add the owner as a member"));
    }

    let role = match body.role.as_str() {
        "VIEWER" | "EDITOR" => body.role.as_str(),
        _ => {
            return Err(AppError::bad_request("role must be VIEWER or EDITOR"));
        }
    };

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
        .bind(target)
        .fetch_one(&state.pool)
        .await?;
    if !exists {
        return Err(AppError::bad_request("User not found"));
    }

    let mid = crate::id::new_cuid();
    sqlx::query(
        r#"INSERT INTO collection_members (id, collection_id, user_id, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4::"CollectionRole", NOW(), NOW())
           ON CONFLICT (collection_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()"#,
    )
    .bind(&mid)
    .bind(&id)
    .bind(target)
    .bind(role)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "success": true })))
}

#[derive(Debug, Deserialize)]
struct UpdateMemberRoleBody {
    role: String,
}

async fn update_member_role(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, member_user_id)): Path<(String, String)>,
    Json(body): Json<UpdateMemberRoleBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.share").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage collection members",
        ));
    }

    let (owner_id, _) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if owner_id != user.id {
        return Err(AppError::forbidden(
            "Only the collection owner can update members",
        ));
    }

    let role = match body.role.as_str() {
        "VIEWER" | "EDITOR" => body.role.as_str(),
        _ => {
            return Err(AppError::bad_request("role must be VIEWER or EDITOR"));
        }
    };

    if member_user_id == owner_id {
        return Err(AppError::bad_request("Cannot change role for the owner"));
    }

    let n = sqlx::query(
        r#"UPDATE collection_members SET role = $1::"CollectionRole", updated_at = NOW()
           WHERE collection_id = $2 AND user_id = $3"#,
    )
    .bind(role)
    .bind(&id)
    .bind(&member_user_id)
    .execute(&state.pool)
    .await?
    .rows_affected();

    if n == 0 {
        return Err(AppError::not_found("Member not found"));
    }

    Ok(Json(json!({ "success": true })))
}

async fn remove_member(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, member_user_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "collections.share").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage collection members",
        ));
    }

    let (owner_id, _) = ensure_collection_access(&state.pool, &user.id, &id).await?;
    if owner_id != user.id {
        return Err(AppError::forbidden(
            "Only the collection owner can remove members",
        ));
    }

    if member_user_id == owner_id {
        return Err(AppError::bad_request("Cannot remove collection owner"));
    }

    let n =
        sqlx::query(r#"DELETE FROM collection_members WHERE collection_id = $1 AND user_id = $2"#)
            .bind(&id)
            .bind(&member_user_id)
            .execute(&state.pool)
            .await?
            .rows_affected();

    if n == 0 {
        return Err(AppError::not_found("Member not found"));
    }

    Ok(Json(json!({ "success": true })))
}
