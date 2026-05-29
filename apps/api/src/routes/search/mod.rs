//! Global and advanced search across tickets, todos, links, and time entries with access-aware SQL.

// Human: Search merges pg_trgm similarity scores with recent click history so frequently opened items bubble up without ignoring text relevance.
// Agent: router /search /search/advanced /search/access; CALLS queries::*_SEARCH_SQL; engine rank_and_truncate + fetch_recent_access_counts; check_permission gates.

mod engine;
mod enhanced_parser;
mod queries;
mod settings_catalog;

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
use crate::routes::helpers::{check_permission, get_user_permission_keys, require_permission};

use engine::{ScoredHit, fetch_recent_access_counts, rank_and_truncate};
use enhanced_parser::{
    combine_fuzzy_terms, get_enhanced_search_body, is_enhanced_search_query,
    map_enhanced_type_to_filters, parse_enhanced_search_query, parse_timestamp_range,
};
use queries::{
    COMMENT_SEARCH_SQL, CUSTOMER_SEARCH_SQL, EMPLOYEE_SEARCH_SQL, LINK_SEARCH_SQL,
    TICKET_SEARCH_SQL, TIME_ENTRY_SEARCH_SQL, TODO_SEARCH_SQL, USER_SEARCH_SQL,
};
use settings_catalog::search_settings;

// Human: `POST /search/access` records lightweight telemetry used only for ranking boosts inside the sliding window.
// Agent: Router GET search + advanced; POST record_search_access.

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/search", get(global_search))
        .route("/search/advanced", get(advanced_search))
        .route("/search/enhanced", post(enhanced_search))
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
    status: Option<String>,
    priority: Option<String>,
    #[serde(rename = "type")]
    ticket_type: Option<String>,
    #[serde(rename = "assignedTo")]
    assigned_to: Option<String>,
    #[serde(rename = "createdFrom")]
    created_from: Option<String>,
    #[serde(rename = "createdTo")]
    created_to: Option<String>,
    #[serde(rename = "updatedFrom")]
    updated_from: Option<String>,
    #[serde(rename = "updatedTo")]
    updated_to: Option<String>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct EnhancedSearchBody {
    query: String,
}

#[derive(Clone)]
struct SearchFilters {
    query: String,
    status: Option<String>,
    priority: Option<String>,
    ticket_type: Option<String>,
    assigned_to: Option<String>,
    created_from: Option<String>,
    created_to: Option<String>,
    updated_from: Option<String>,
    updated_to: Option<String>,
    sort_by: String,
    sort_order: String,
    restrict_result_types: Option<Vec<String>>,
    restrict_link_type: Option<String>,
    include_archived_only: bool,
}

impl Default for SearchFilters {
    fn default() -> Self {
        Self {
            query: String::new(),
            status: None,
            priority: None,
            ticket_type: None,
            assigned_to: None,
            created_from: None,
            created_to: None,
            updated_from: None,
            updated_to: None,
            sort_by: "updatedAt".to_string(),
            sort_order: "desc".to_string(),
            restrict_result_types: None,
            restrict_link_type: None,
            include_archived_only: false,
        }
    }
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
    user_role: String,
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
    let user_role: String = sqlx::query_scalar("SELECT role::text FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "USER".to_string());
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
        user_role,
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

fn comment_to_result(r: &sqlx::postgres::PgRow) -> Result<serde_json::Value, AppError> {
    let id: String = r.get("id");
    let ticket_id: String = r.get("ticket_id");
    let content: String = r.get("content");
    let created_at: chrono::NaiveDateTime = r.get("created_at");
    let ticket_number: String = r.get("ticket_number");
    let ticket_title: String = r.get("ticket_title");
    let snippet = if content.chars().count() > 120 {
        format!("{}…", content.chars().take(120).collect::<String>())
    } else {
        content.clone()
    };
    Ok(json!({
        "type": "comment",
        "id": id,
        "title": snippet,
        "description": content,
        "url": format!("/dashboard/tickets/{}", ticket_id),
        "parentTicketId": ticket_id,
        "context": "Comment",
        "metadata": {
            "ticketNumber": ticket_number,
            "ticketTitle": ticket_title,
            "createdAt": created_at.and_utc().to_rfc3339(),
        },
    }))
}

fn should_run_type(restrict: &Option<Vec<String>>, types: &[&str]) -> bool {
    match restrict {
        None => true,
        Some(list) if list.is_empty() => true,
        Some(list) => types.iter().any(|t| list.iter().any(|r| r == t)),
    }
}

fn filters_have_ticket_constraints(filters: &SearchFilters) -> bool {
    filters.status.is_some()
        || filters.priority.is_some()
        || filters.ticket_type.is_some()
        || filters.assigned_to.is_some()
        || filters.created_from.is_some()
        || filters.created_to.is_some()
        || filters.updated_from.is_some()
        || filters.updated_to.is_some()
}

async fn search_tickets_with_filters(
    pool: &sqlx::PgPool,
    user_id: &str,
    ctx: &SearchContext,
    filters: &SearchFilters,
    cap: i64,
) -> Result<Vec<ScoredHit>, AppError> {
    let sort_col = match filters.sort_by.as_str() {
        "createdAt" => "created_at",
        _ => "updated_at",
    };
    let sort_dir = if filters.sort_order.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT id, ticket_number, title, description, status::text AS status, priority::text AS priority, 1.0::float8 AS match_score FROM tickets WHERE archived_at IS NULL AND (",
    );
    if ctx.can_view_all_tickets {
        qb.push("TRUE");
    } else {
        qb.push("created_by_id = ");
        qb.push_bind(user_id);
        qb.push(" OR assigned_to_id = ");
        qb.push_bind(user_id);
        qb.push(" OR assigned_to_group_id IN (SELECT gm.group_id FROM group_memberships gm WHERE gm.user_id = ");
        qb.push_bind(user_id);
        qb.push(")");
    }
    qb.push(")");

    if let Some(status) = &filters.status {
        if status.eq_ignore_ascii_case("UNRESOLVED") {
            qb.push(" AND status IN ('OPEN','IN_PROGRESS','PENDING')");
        } else {
            qb.push(" AND status = ");
            qb.push_bind(status.to_uppercase());
        }
    }
    if let Some(priority) = &filters.priority {
        qb.push(" AND priority = ");
        qb.push_bind(priority.to_uppercase());
    }
    if let Some(ticket_type) = &filters.ticket_type {
        qb.push(" AND type = ");
        qb.push_bind(ticket_type.to_uppercase());
    }
    if let Some(assigned_to) = &filters.assigned_to {
        qb.push(" AND assigned_to_id = ");
        qb.push_bind(assigned_to);
    }
    if let Some(from) = &filters.created_from {
        qb.push(" AND created_at >= ");
        qb.push_bind(from);
    }
    if let Some(to) = &filters.created_to {
        qb.push(" AND created_at <= ");
        qb.push_bind(format!("{to} 23:59:59"));
    }
    if let Some(from) = &filters.updated_from {
        qb.push(" AND updated_at >= ");
        qb.push_bind(from);
    }
    if let Some(to) = &filters.updated_to {
        qb.push(" AND updated_at <= ");
        qb.push_bind(format!("{to} 23:59:59"));
    }

    qb.push(format!(" ORDER BY {sort_col} {sort_dir} LIMIT "));
    qb.push_bind(cap);

    let rows = qb.build().fetch_all(pool).await?;
    let mut hits = Vec::new();
    for r in rows {
        let id: String = r.get("id");
        hits.push(ScoredHit {
            entity_type: "ticket".to_string(),
            entity_id: id,
            match_score: row_match_score(&r),
            result: ticket_to_result(&r)?,
        });
    }
    Ok(hits)
}

/// Per-entity candidate cap before global merge + ranking (wider net, then cut to `limit`).
fn per_type_fetch_limit(requested: i64) -> i64 {
    requested.max(20).min(100)
}

async fn execute_unified_search(
    state: &AppState,
    user_id: &str,
    filters: SearchFilters,
    limit: i64,
) -> Result<SearchResponse, AppError> {
    let ctx = load_search_context(&state.pool, user_id).await;
    let cap = per_type_fetch_limit(limit);
    let q = filters.query.trim();
    let has_text = q.len() >= 2;
    let restrict = filters.restrict_result_types.clone();

    let run_tickets = can_search_tickets(&ctx) && should_run_type(&restrict, &["ticket", "comment"]);
    let run_todos = can_search_todos(&ctx) && should_run_type(&restrict, &["task"]);
    let run_links = can_search_links(&ctx) && should_run_type(&restrict, &["link"]);
    let run_time = can_search_time(&ctx) && should_run_type(&restrict, &["timeentry"]);
    let run_employees =
        can_search_employees(&ctx) && should_run_type(&restrict, &["employee"]);
    let run_customers =
        can_search_customers(&ctx) && should_run_type(&restrict, &["customer"]);
    let run_users = can_search_users(&ctx) && should_run_type(&restrict, &["user"]);
    let run_settings = should_run_type(&restrict, &["setting"]);
    let run_comments = run_tickets && has_text && should_run_type(&restrict, &["comment", "ticket"]);

    let mut hits: Vec<ScoredHit> = Vec::new();

    if run_tickets {
        if has_text {
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
        } else if filters_have_ticket_constraints(&filters) {
            hits.extend(
                search_tickets_with_filters(&state.pool, user_id, &ctx, &filters, cap).await?,
            );
        }
    }

    if run_comments {
        let hide_agent_only = ctx.user_role == "USER";
        let rows = sqlx::query(COMMENT_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .bind(ctx.can_view_all_tickets)
            .bind(hide_agent_only)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            hits.push(ScoredHit {
                entity_type: "comment".to_string(),
                entity_id: id,
                match_score: score,
                result: comment_to_result(&r)?,
            });
        }
    }

    if run_todos && has_text {
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

    if run_links && has_text {
        let rows = sqlx::query(LINK_SEARCH_SQL)
            .bind(user_id)
            .bind(q)
            .bind(cap)
            .fetch_all(&state.pool)
            .await?;
        for r in rows {
            let score = row_match_score(&r);
            let id: String = r.get("id");
            let result = link_to_result(&r)?;
            if let Some(link_type) = &filters.restrict_link_type {
                let meta = result
                    .get("metadata")
                    .and_then(|m| m.get("linkType"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if meta != link_type.as_str() {
                    continue;
                }
            }
            hits.push(ScoredHit {
                entity_type: "link".to_string(),
                entity_id: id,
                match_score: score,
                result,
            });
        }
    }

    if run_time && has_text {
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

    if run_employees && has_text {
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

    if run_customers && has_text {
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

    if run_users && has_text {
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

    if run_settings && has_text {
        hits.extend(search_settings(
            q,
            &ctx.perm_keys,
            cap as usize,
        ));
    }

    let total_matches = hits.len() as u64;
    let pairs: Vec<(&str, &str)> = hits
        .iter()
        .map(|h| (h.entity_type.as_str(), h.entity_id.as_str()))
        .collect();
    let counts = fetch_recent_access_counts(&state.pool, user_id, &pairs).await?;
    let mut ranked = rank_and_truncate(hits, &counts, limit as usize);

    if filters.include_archived_only {
        ranked.retain(|r| {
            r.get("metadata")
                .and_then(|m| m.get("archivedAt"))
                .map(|v| !v.is_null())
                .unwrap_or(false)
        });
    }

    Ok(SearchResponse {
        results: ranked,
        total: total_matches,
    })
}

fn advanced_params_to_filters(params: &AdvancedSearchParams) -> SearchFilters {
    SearchFilters {
        query: params.q.clone().unwrap_or_default(),
        status: params.status.clone(),
        priority: params.priority.clone(),
        ticket_type: params.ticket_type.clone(),
        assigned_to: params.assigned_to.clone(),
        created_from: params.created_from.clone(),
        created_to: params.created_to.clone(),
        updated_from: params.updated_from.clone(),
        updated_to: params.updated_to.clone(),
        sort_by: params.sort_by.clone().unwrap_or_else(|| "updatedAt".to_string()),
        sort_order: params.sort_order.clone().unwrap_or_else(|| "desc".to_string()),
        restrict_result_types: None,
        restrict_link_type: None,
        include_archived_only: false,
    }
}

async fn global_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    require_permission(&state.pool, &user.id, "search.use").await?;
    let query = params.q.unwrap_or_default().trim().to_string();
    if query.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(20).min(50);
    let filters = SearchFilters {
        query,
        ..SearchFilters::default()
    };
    let response = execute_unified_search(&state, &user.id, filters, limit).await?;
    Ok(Json(response))
}

async fn advanced_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<AdvancedSearchParams>,
) -> Result<Json<SearchResponse>, AppError> {
    require_permission(&state.pool, &user.id, "search.use").await?;
    let filters = advanced_params_to_filters(&params);
    let has_query_or_filters = !filters.query.trim().is_empty() || filters_have_ticket_constraints(&filters);
    if !has_query_or_filters {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let limit = params.limit.unwrap_or(100).min(200).max(1);
    let response = execute_unified_search(&state, &user.id, filters, limit).await?;
    Ok(Json(response))
}

async fn enhanced_search(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<EnhancedSearchBody>,
) -> Result<Json<SearchResponse>, AppError> {
    require_permission(&state.pool, &user.id, "search.use").await?;
    let raw = body.query.trim();
    if raw.is_empty() || !is_enhanced_search_query(raw) {
        return Err(AppError::bad_request(
            "Query must start with '>' for enhanced search",
        ));
    }

    let body_text = get_enhanced_search_body(raw);
    let parsed = parse_enhanced_search_query(body_text).unwrap_or_default();
    let query = combine_fuzzy_terms(&parsed);
    let mut created_from = parsed.date.clone();
    let mut created_to = parsed.date.clone();
    if let Some(ts) = parsed.timestamp.as_deref() {
        let (from, to) = parse_timestamp_range(ts);
        if from.is_some() {
            created_from = from;
        }
        if to.is_some() {
            created_to = to;
        }
    }

    let type_map = parsed
        .type_filter
        .as_deref()
        .map(map_enhanced_type_to_filters)
        .unwrap_or_default();

    let filters = SearchFilters {
        query,
        created_from,
        created_to,
        restrict_result_types: type_map
            .result_types
            .map(|v| v.into_iter().map(str::to_string).collect()),
        restrict_link_type: type_map.link_type,
        include_archived_only: type_map.archive_only,
        ..SearchFilters::default()
    };

    let has_work = !filters.query.trim().is_empty()
        || filters.created_from.is_some()
        || filters.created_to.is_some()
        || filters.restrict_result_types.is_some()
        || filters.include_archived_only;
    if !has_work {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
        }));
    }

    let response = execute_unified_search(&state, &user.id, filters, 100).await?;
    Ok(Json(response))
}

async fn record_search_access(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<SearchAccessBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "search.use").await?;
    let et = body.entity_type.trim();
    let eid = body.entity_id.trim();
    if eid.is_empty() {
        return Err(AppError::bad_request("entity_id required"));
    }
    let allowed = matches!(
        et,
        "ticket" | "task" | "link" | "timeentry" | "employee" | "customer" | "user" | "comment" | "setting"
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
