//! Global and advanced search across tickets, todos, links, and time entries with access-aware SQL.

// Human: Search merges pg_trgm similarity scores with recent click history so frequently opened items bubble up without ignoring text relevance.
// Agent: router /search /search/advanced /search/access; CALLS queries::*_SEARCH_SQL; engine rank_and_truncate + fetch_recent_access_counts; check_permission gates.

mod engine;
mod queries;

use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;
use crate::routes::helpers::{check_permission, get_user_permission_keys};

use engine::{ScoredHit, fetch_recent_access_counts, rank_and_truncate};
use queries::{
    CUSTOMER_SEARCH_SQL, EMPLOYEE_SEARCH_SQL, LINK_SEARCH_SQL, TICKET_SEARCH_SQL,
    TIME_ENTRY_SEARCH_SQL, TODO_SEARCH_SQL, USER_SEARCH_SQL,
};

// Human: `POST /search/access` records lightweight telemetry used only for ranking boosts inside the sliding window.
// Agent: Router GET search + advanced; POST record_search_access.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/search", get(global_search))
        .route("/search/advanced", get(advanced_search))
        .route("/search/access", post(record_search_access))
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize, Default)]
struct AdvancedSearchParams {
    q: Option<String>,
    #[serde(rename = "type")]
    type_filter: Option<String>,
    limit: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct SearchResponse {
    results: Vec<serde_json::Value>,
    total: u64,
}

#[derive(Deserialize)]
struct SearchAccessBody {
    #[serde(alias = "entityType")]
    entity_type: String,
    #[serde(alias = "entityId")]
    entity_id: String,
}

struct SearchContext {
    perm_keys: Vec<String>,
    mod_tickets: bool,
    mod_todos: bool,
    mod_links: bool,
    mod_time: bool,
    mod_employees: bool,
    mod_customers: bool,
    mod_users: bool,
    can_view_all_tickets: bool,
    can_view_all_time: bool,
}

async fn module_enabled(pool: &sqlx::PgPool, key: &str) -> bool {
    sqlx::query_scalar::<_, bool>("SELECT COALESCE(enabled, false) FROM modules WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

async fn load_search_context(pool: &sqlx::PgPool, user_id: &str) -> SearchContext {
    let perm_keys = get_user_permission_keys(pool, user_id).await;
    let mod_tickets = module_enabled(pool, "tickets").await;
    let mod_todos = module_enabled(pool, "todos").await;
    let mod_links = module_enabled(pool, "links").await;
    let mod_time = module_enabled(pool, "timetracking").await;
    let mod_employees = module_enabled(pool, "employees").await;
    let mod_customers = module_enabled(pool, "customers").await;
    let mod_users = module_enabled(pool, "users").await;
    let can_view_all_tickets = check_permission(pool, user_id, "tickets.view_all").await
        || check_permission(pool, user_id, "admin.tickets.manage").await;
    let can_view_all_time = check_permission(pool, user_id, "time_tracking.view_all").await;

    SearchContext {
        perm_keys,
        mod_tickets,
        mod_todos,
        mod_links,
        mod_time,
        mod_employees,
        mod_customers,
        mod_users,
        can_view_all_tickets,
        can_view_all_time,
    }
}

fn has_perm(keys: &[String], key: &str) -> bool {
    keys.iter().any(|k| k == key)
}

fn can_search_tickets(ctx: &SearchContext) -> bool {
    ctx.mod_tickets
        && (has_perm(&ctx.perm_keys, "tickets.view")
            || has_perm(&ctx.perm_keys, "tickets.view_all")
            || has_perm(&ctx.perm_keys, "admin.tickets.manage"))
}

fn can_search_todos(ctx: &SearchContext) -> bool {
    ctx.mod_todos && has_perm(&ctx.perm_keys, "todos.view")
}

fn can_search_links(ctx: &SearchContext) -> bool {
    ctx.mod_links && has_perm(&ctx.perm_keys, "links.view")
}

fn can_search_time(ctx: &SearchContext) -> bool {
    ctx.mod_time
        && (has_perm(&ctx.perm_keys, "time_tracking.view")
            || has_perm(&ctx.perm_keys, "time_tracking.view_all"))
}

fn can_search_employees(ctx: &SearchContext) -> bool {
    ctx.mod_employees && has_perm(&ctx.perm_keys, "employees.view")
}

fn can_search_customers(ctx: &SearchContext) -> bool {
    ctx.mod_customers && has_perm(&ctx.perm_keys, "customers.view")
}

fn can_search_users(ctx: &SearchContext) -> bool {
    ctx.mod_users && has_perm(&ctx.perm_keys, "users.view")
}

fn row_match_score(r: &sqlx::postgres::PgRow) -> f64 {
    r.try_get::<f64, _>("match_score").unwrap_or(0.0)
}

fn ticket_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "ticket",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/tickets/{}", id),
        "metadata": {
            "ticketNumber": r.get::<String, _>("ticket_number"),
            "status": r.get::<String, _>("status"),
            "priority": r.get::<String, _>("priority"),
        },
    }))
}

fn todo_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    let description: Option<String> = r.get("description");
    let description_plain: Option<String> = r.get("description_plain");
    Ok(json!({
        "type": "task",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": description.or(description_plain),
        "url": format!("/dashboard/todos/{}", id),
        "metadata": {
            "todoNumber": r.get::<Option<String>, _>("todo_number"),
            "status": r.get::<String, _>("status"),
            "priority": r.get::<String, _>("priority"),
        },
    }))
}

fn link_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    // `links.created_at` is SQL `TIMESTAMP` (no TZ); decode as NaiveDateTime, emit as UTC RFC3339.
    let created_at: chrono::NaiveDateTime = r.get::<chrono::NaiveDateTime, _>("created_at");
    let tags: Vec<String> = r.get::<Vec<String>, _>("tags");
    let extra: Option<serde_json::Value> = r.get::<Option<serde_json::Value>, _>("link_metadata");

    let mut meta = json!({
        "linkUrl": r.get::<String, _>("url"),
        "linkType": r.get::<String, _>("link_type"),
        "tags": tags,
        "favicon": r.get::<Option<String>, _>("favicon"),
        "rating": r.get::<Option<i32>, _>("rating"),
        "createdAt": created_at.and_utc().to_rfc3339(),
    });
    if let Some(obj) = meta.as_object_mut() {
        if let Some(j) = extra {
            obj.insert("metadata".to_string(), j);
        }
    }

    Ok(json!({
        "type": "link",
        "id": id,
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/links/{}", id),
        "metadata": meta,
    }))
}

fn time_entry_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    // Human: iOS and web search rows show the same “when, how long, breaks” line as the time list without a second API fetch.
    // Agent: EMITS startedAt/lastResumedAt/stoppedAt/… + totalDuration + breakDurationTotal from row; RFC3339 datetimes; SUM(breaks.duration) subquery in TIME_ENTRY_SEARCH_SQL.
    let id: String = r.get("id");
    let started_at: chrono::NaiveDateTime = r.get("started_at");
    let paused_at: Option<chrono::NaiveDateTime> = r.get("paused_at");
    let stopped_at: Option<chrono::NaiveDateTime> = r.get("stopped_at");
    let completed_at: Option<chrono::NaiveDateTime> = r.get("completed_at");
    let last_resumed_at: Option<chrono::NaiveDateTime> = r.get("last_resumed_at");
    let total_duration: i32 = r.get("total_duration");
    let break_duration_total: i32 = r.get("break_duration_total");
    let iso = |n: Option<chrono::NaiveDateTime>| n.map(|d| d.and_utc().to_rfc3339());
    Ok(json!({
        "type": "timeentry",
        "id": id,
        "title": r.get::<String, _>("name"),
        "description": r.get::<Option<String>, _>("description"),
        "url": format!("/dashboard/time-tracking/{}", id),
        "metadata": {
            "status": r.get::<String, _>("status"),
            "startedAt": started_at.and_utc().to_rfc3339(),
            "pausedAt": iso(paused_at),
            "stoppedAt": iso(stopped_at),
            "completedAt": iso(completed_at),
            "lastResumedAt": iso(last_resumed_at),
            "totalDuration": total_duration,
            "breakDurationTotal": break_duration_total,
        },
    }))
}

fn employee_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    let first_name: String = r.get("first_name");
    let last_name: String = r.get("last_name");
    Ok(json!({
        "type": "employee",
        "id": id,
        "title": format!("{} {}", first_name, last_name),
        "description": r.get::<Option<String>, _>("title"),
        "url": format!("/dashboard/employees/{}", id),
        "metadata": {
            "firstName": first_name,
            "lastName": last_name,
            "email": r.get::<String, _>("email"),
            "title": r.get::<Option<String>, _>("title"),
            "companyRole": r.get::<Option<String>, _>("company_role"),
            "department": r.get::<Option<String>, _>("department"),
            "employeeStatus": r.get::<String, _>("employee_status"),
        },
    }))
}

fn customer_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    let customer_type: String = r.get("customer_type");
    let title = if customer_type == "COMPANY" {
        r.get::<Option<String>, _>("company_name")
            .unwrap_or_else(|| "Company".to_string())
    } else {
        format!(
            "{} {}",
            r.get::<Option<String>, _>("first_name")
                .unwrap_or_default(),
            r.get::<Option<String>, _>("last_name")
                .unwrap_or_default()
        )
        .trim()
        .to_string()
    };
    Ok(json!({
        "type": "customer",
        "id": id,
        "title": title,
        "description": r.get::<Option<String>, _>("email"),
        "url": format!("/dashboard/customers/{}", id),
        "metadata": {
            "customerNumber": r.get::<String, _>("customer_number"),
            "customerType": customer_type,
            "email": r.get::<Option<String>, _>("email"),
        },
    }))
}

fn user_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    Ok(json!({
        "type": "user",
        "id": id,
        "title": r.get::<Option<String>, _>("name").unwrap_or_default(),
        "description": r.get::<String, _>("email"),
        "url": format!("/dashboard/users/{}", id),
        "metadata": {
            "email": r.get::<String, _>("email"),
            "role": r.get::<String, _>("role"),
        },
    }))
}

/// Per-entity candidate cap before global merge + ranking (wider net, then cut to `limit`).
fn per_type_fetch_limit(requested: i64) -> i64 {
    requested.max(12).min(80)
}

async fn execute_unified_search(
    state: &AppState,
    user_id: &str,
    q: &str,
    limit: i64,
    type_filter: Option<&str>,
) -> Result<SearchResponse, AppError> {
    let ctx = load_search_context(&state.pool, user_id).await;
    let cap = per_type_fetch_limit(limit);
    let tf = type_filter.map(|s| s.to_lowercase());

    let run_tickets = can_search_tickets(&ctx)
        && tf
            .as_deref()
            .map(|t| !["todo", "link", "timeentry", "employee", "customer", "user"].contains(&t))
            .unwrap_or(true);
    let run_todos = can_search_todos(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "link", "timeentry", "employee", "customer", "user"].contains(&t))
            .unwrap_or(true);
    let run_links = can_search_links(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "todo", "timeentry", "employee", "customer", "user"].contains(&t))
            .unwrap_or(true);
    let run_time = can_search_time(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "todo", "link", "employee", "customer", "user"].contains(&t))
            .unwrap_or(true);
    let run_employees = can_search_employees(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "todo", "link", "timeentry", "customer", "user"].contains(&t))
            .unwrap_or(true);
    let run_customers = can_search_customers(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "todo", "link", "timeentry", "employee", "user"].contains(&t))
            .unwrap_or(true);
    let run_users = can_search_users(&ctx)
        && tf
            .as_deref()
            .map(|t| !["ticket", "todo", "link", "timeentry", "employee", "customer"].contains(&t))
            .unwrap_or(true);

    let mut hits: Vec<ScoredHit> = Vec::new();

    if run_tickets {
        let rows = sqlx::query(TICKET_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .bind(ctx.can_view_all_tickets)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "ticket".to_string(),
                entity_id: id,
                match_score: score,
                result: ticket_to_result(&r)?,
            });
        }
    }

    if run_todos {
        let rows = sqlx::query(TODO_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .bind(ctx.can_view_all_tickets)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "task".to_string(),
                entity_id: id,
                match_score: score,
                result: todo_to_result(&r)?,
            });
        }
    }

    if run_links {
        let rows = sqlx::query(LINK_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "link".to_string(),
                entity_id: id,
                match_score: score,
                result: link_to_result(&r)?,
            });
        }
    }

    if run_time {
        let rows = sqlx::query(TIME_ENTRY_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .bind(ctx.can_view_all_time)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "timeentry".to_string(),
                entity_id: id,
                match_score: score,
                result: time_entry_to_result(&r)?,
            });
        }
    }

    if run_employees {
        let rows = sqlx::query(EMPLOYEE_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "employee".to_string(),
                entity_id: id,
                match_score: score,
                result: employee_to_result(&r)?,
            });
        }
    }

    if run_customers {
        let rows = sqlx::query(CUSTOMER_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "customer".to_string(),
                entity_id: id,
                match_score: score,
                result: customer_to_result(&r)?,
            });
        }
    }

    if run_users {
        let rows = sqlx::query(USER_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "user".to_string(),
                entity_id: id,
                match_score: score,
                result: user_to_result(&r)?,
            });
        }
    }

    let total_matches = hits.len() as u64;
    let pairs: Vec<(&str, &str)> = hits
        .iter()
        .map(|h| (h.entity_type.as_str(), h.entity_id.as_str()))
        .collect();
    let counts = fetch_recent_access_counts(&state.pool, user_id, &pairs).await?;
    let ranked = rank_and_truncate(hits, &counts, limit as usize);

    Ok(SearchResponse {
        results: ranked,
        total: total_matches,
    })
}

async fn global_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(20).min(50);
    let response = execute_unified_search(&state, &user.id, &query, limit, None).await?;
    Ok(Json(response))
}

async fn advanced_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<AdvancedSearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    let query = params.q.as_deref().unwrap_or("").trim();
    if query.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(100).min(200).max(1);
    let tf = params.type_filter.as_deref().map(|s| s.trim());
    let response = execute_unified_search(&state, &user.id, query, limit, tf).await?;
    Ok(Json(response))
}

async fn record_search_access(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SearchAccessBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    let et = body.entity_type.trim();
    let eid = body.entity_id.trim();
    if eid.is_empty() {
        return Err(AppError::bad_request("entity_id required"));
    }
    let allowed = matches!(
        et,
        "ticket" | "task" | "link" | "timeentry" | "employee" | "user" | "comment" | "setting"
    );
    if !allowed {
        return Err(AppError::bad_request("unsupported entity_type"));
    }

    sqlx::query(
        r#"INSERT INTO search_result_accesses (id, user_id, entity_type, entity_id, accessed_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3, NOW())"#,
    )
    .bind(&user.id)
    .bind(et)
    .bind(eid)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "ok": true })))
}
