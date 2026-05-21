//! Structured, permission-gated database explorer for admins — no client-supplied SQL for browsing.
//!
// Human: Replaces the legacy raw-SQL console with schema metadata, paginated table reads, and audited row mutations.
// Agent: ROUTES /admin/db/schema|tables/{table}/rows|sql; READS information_schema; WRITES audit on sql/mutations; READ ONLY tx for sql lab.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, patch, post},
};
use regex::Regex;
use serde::Deserialize;
use sqlx::{PgPool, QueryBuilder, Row};
use std::collections::HashMap;
use std::sync::LazyLock;

use crate::audit::{self, WriteAuditParams};
use crate::auth::extractors::AuthUser;
use crate::error::AppError;
use crate::routes::AppState;
use crate::routes::helpers::{require_any_permission, require_permission};

const DEFAULT_PAGE_LIMIT: u32 = 50;
const MAX_PAGE_LIMIT: u32 = 200;
const MAX_SQL_ROWS: i64 = 500;
const SEARCH_MAX_LEN: usize = 200;

/// Tables that cannot be mutated through the explorer (auth/session artifacts).
// Human: Direct edits to session rows could hijack accounts; we still allow read-only inspection when permitted.
// Agent: MUTATION_BLOCKED_TABLES; PATCH/DELETE return 403; GET rows still allowed with mask on sensitive columns.
const MUTATION_BLOCKED_TABLES: &[&str] = &["sessions", "qr_login_requests", "_sqlx_migrations"];

/// Column names never writable via the explorer (secrets stay server-side only).
// Human: Even admins should not paste a new password hash through the grid editor.
// Agent: NON_EDITABLE_COLUMNS stripped on PATCH; masked as "***" on GET responses.
const NON_EDITABLE_COLUMNS: &[&str] = &["password", "password_hash", "token", "refresh_token"];

/// Columns redacted in API responses (read still allowed for support).
const MASKED_COLUMNS: &[&str] = &["password", "password_hash", "token", "refresh_token"];

static FORBIDDEN_SQL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|MERGE|REPLACE|INTO|SET\s+ROLE)\b",
    )
    .expect("FORBIDDEN_SQL regex")
});

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/db/schema", get(db_schema))
        .route("/admin/db/tables/{table}/rows", get(db_table_rows))
        .route("/admin/db/tables/{table}/rows", patch(db_table_row_update))
        .route("/admin/db/tables/{table}/rows", delete(db_table_row_delete))
        .route("/admin/db/sql", post(db_sql_readonly))
}

// Human: Small audit helper so this module does not depend on private helpers in `admin.rs`.
// Agent: CALLS audit::write_audit_log; READS HeaderMap for IP/UA; fire-and-forget like other admin mutations.
fn write_db_audit(
    pool: &PgPool,
    actor_id: &str,
    action: &str,
    resource_type: &str,
    resource_id: &str,
    context: Option<serde_json::Value>,
    headers: &HeaderMap,
) {
    audit::write_audit_log(
        pool,
        WriteAuditParams {
            user_id: Some(actor_id.to_string()),
            action: action.to_string(),
            resource_type: Some(resource_type.to_string()),
            resource_id: Some(resource_id.to_string()),
            context,
            ip_address: audit::client_ip_from_headers(headers),
            user_agent: audit::user_agent_from_headers(headers),
        },
    );
}

fn sanitize_identifier(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 128 {
        return Err(AppError::bad_request("Invalid identifier"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::bad_request("Invalid identifier"));
    }
    Ok(trimmed.to_string())
}

async fn table_exists(pool: &PgPool, table: &str) -> Result<bool, AppError> {
    let exists: bool = sqlx::query_scalar(
        r#"SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        )"#,
    )
    .bind(table)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

fn is_mutation_blocked(table: &str) -> bool {
    MUTATION_BLOCKED_TABLES.contains(&table)
}

fn is_non_editable_column(column: &str) -> bool {
    NON_EDITABLE_COLUMNS.contains(&column)
}

fn is_masked_column(column: &str) -> bool {
    MASKED_COLUMNS.contains(&column)
}

fn mask_row_values(row: &mut serde_json::Map<String, serde_json::Value>) {
    for key in row.keys().cloned().collect::<Vec<_>>() {
        if is_masked_column(&key) {
            row.insert(key, serde_json::json!("***"));
        }
    }
}

#[derive(Debug, Clone)]
struct TableColumnMeta {
    name: String,
    data_type: String,
    is_nullable: bool,
    is_primary_key: bool,
}

async fn load_table_columns(pool: &PgPool, table: &str) -> Result<Vec<TableColumnMeta>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable = 'YES' AS is_nullable,
            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = 'public'
                  AND tc.table_name = c.table_name
                  AND kcu.column_name = c.column_name
            ) AS is_primary_key
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position
        "#,
    )
    .bind(table)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| TableColumnMeta {
            name: r.get("column_name"),
            data_type: r.get("data_type"),
            is_nullable: r.get("is_nullable"),
            is_primary_key: r.get("is_primary_key"),
        })
        .collect())
}

fn primary_key_columns(columns: &[TableColumnMeta]) -> Vec<String> {
    let mut pk: Vec<String> = columns
        .iter()
        .filter(|c| c.is_primary_key)
        .map(|c| c.name.clone())
        .collect();
    if pk.is_empty() && columns.iter().any(|c| c.name == "id") {
        pk.push("id".to_string());
    }
    pk
}

// Human: Schema endpoint powers the sidebar and column editor with real PostgreSQL types instead of guessing.
// Agent: GET /admin/db/schema; REQUIRES admin.db.view|view_entries; RETURNS tables+columns+estimated row counts.

async fn db_schema(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_any_permission(
        &state.pool,
        &user.id,
        &["admin.db.view", "admin.db.view_entries"],
    )
    .await?;

    let column_rows = sqlx::query(
        r#"
        SELECT
            c.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable = 'YES' AS is_nullable,
            EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = 'public'
                  AND tc.table_name = c.table_name
                  AND kcu.column_name = c.column_name
            ) AS is_primary_key
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let count_rows = sqlx::query(
        r#"
        SELECT c.relname AS table_name, GREATEST(c.reltuples::bigint, 0) AS row_estimate
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    let mut estimates: HashMap<String, i64> = HashMap::new();
    for row in count_rows {
        let name: String = row.get("table_name");
        let est: i64 = row.get("row_estimate");
        estimates.insert(name, est);
    }

    let mut tables: HashMap<String, serde_json::Value> = HashMap::new();
    for row in column_rows {
        let table_name: String = row.get("table_name");
        let col_name: String = row.get("column_name");
        let data_type: String = row.get("data_type");
        let is_nullable: bool = row.get("is_nullable");
        let is_primary_key: bool = row.get("is_primary_key");

        let entry = tables.entry(table_name.clone()).or_insert_with(|| {
            serde_json::json!({
                "name": table_name,
                "rowEstimate": estimates.get(&table_name).copied().unwrap_or(0),
                "mutationBlocked": is_mutation_blocked(&table_name),
                "columns": [],
            })
        });

        if let Some(cols) = entry
            .get_mut("columns")
            .and_then(|v| v.as_array_mut())
        {
            cols.push(serde_json::json!({
                "name": col_name,
                "dataType": data_type,
                "nullable": is_nullable,
                "isPrimaryKey": is_primary_key,
                "editable": !is_non_editable_column(&col_name),
                "masked": is_masked_column(&col_name),
            }));
        }
    }

    let mut table_list: Vec<serde_json::Value> = tables.into_values().collect();
    table_list.sort_by(|a, b| {
        a.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .cmp(b.get("name").and_then(|v| v.as_str()).unwrap_or(""))
    });

    Ok(Json(serde_json::json!({ "tables": table_list })))
}

#[derive(Deserialize)]
struct TableRowsQuery {
    page: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
    sort_column: Option<String>,
    sort_order: Option<String>,
}

// Human: Paginated row reads never accept raw SQL from the browser — only whitelisted table/sort/filter params.
// Agent: GET /admin/db/tables/{table}/rows; REQUIRES admin.db.view_entries; BUILDS parameterized SELECT; MASKS secrets.

async fn db_table_rows(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(table): Path<String>,
    Query(q): Query<TableRowsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "admin.db.view_entries").await?;
    let table = sanitize_identifier(&table)?;
    if !table_exists(&state.pool, &table).await? {
        return Err(AppError::not_found("Table not found"));
    }

    let columns = load_table_columns(&state.pool, &table).await?;
    if columns.is_empty() {
        return Err(AppError::not_found("Table not found"));
    }

    let page = q.page.unwrap_or(1).max(1);
    let limit = q
        .limit
        .unwrap_or(DEFAULT_PAGE_LIMIT)
        .clamp(1, MAX_PAGE_LIMIT);
    let offset = (page - 1).saturating_mul(limit);

    let sort_column = q
        .sort_column
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(sanitize_identifier)
        .transpose()?;

    let sort_col = sort_column
        .as_ref()
        .filter(|col| columns.iter().any(|c| c.name == **col))
        .cloned()
        .or_else(|| primary_key_columns(&columns).first().cloned())
        .or_else(|| columns.first().map(|c| c.name.clone()))
        .ok_or_else(|| AppError::bad_request("Table has no sortable columns"))?;

    let sort_dir = match q.sort_order.as_deref().unwrap_or("desc").to_ascii_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };

    let search = q
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(SEARCH_MAX_LEN).collect::<String>());

    let mut qb = QueryBuilder::new(r#"SELECT row_to_json(t) AS row FROM "#);
    qb.push(format!(r#""public"."{table}" t"#));

    if let Some(ref needle) = search {
        qb.push(" WHERE row_to_json(t)::text ILIKE ");
        qb.push_bind(format!("%{needle}%"));
    }

    qb.push(format!(r#" ORDER BY t."{sort_col}" {sort_dir} NULLS LAST"#));
    qb.push(" LIMIT ");
    qb.push_bind(i64::from(limit));
    qb.push(" OFFSET ");
    qb.push_bind(i64::from(offset));

    let row_values: Vec<serde_json::Value> = qb
        .build_query_scalar::<serde_json::Value>()
        .fetch_all(&state.pool)
        .await?;

    let mut count_qb = QueryBuilder::new(format!(r#"SELECT COUNT(*)::bigint FROM "public"."{table}" t"#));
    if let Some(ref needle) = search {
        count_qb.push(" WHERE row_to_json(t)::text ILIKE ");
        count_qb.push_bind(format!("%{needle}%"));
    }
    let total: i64 = count_qb
        .build_query_scalar()
        .fetch_one(&state.pool)
        .await?;

    let mut rows: Vec<serde_json::Value> = Vec::with_capacity(row_values.len());
    for value in row_values {
        if let serde_json::Value::Object(mut map) = value {
            mask_row_values(&mut map);
            rows.push(serde_json::Value::Object(map));
        } else {
            rows.push(value);
        }
    }

    let column_names: Vec<&str> = columns.iter().map(|c| c.name.as_str()).collect();
    let primary_keys = primary_key_columns(&columns);

    Ok(Json(serde_json::json!({
        "table": table,
        "columns": column_names,
        "primaryKeys": primary_keys,
        "rows": rows,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": if total == 0 { 0 } else { ((total + i64::from(limit) - 1) / i64::from(limit)) as u32 },
        },
    })))
}

#[derive(Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PrimaryKeyValue {
    column: String,
    value: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbRowUpdateBody {
    primary_key: Vec<PrimaryKeyValue>,
    changes: serde_json::Value,
}

// Human: Row updates apply only explicitly changed columns and never touch blocked tables or secret fields.
// Agent: PATCH /admin/db/tables/{table}/rows; REQUIRES admin.db.edit_entries; QueryBuilder UPDATE; AUDIT admin.db.row_update.

async fn db_table_row_update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(table): Path<String>,
    Json(body): Json<DbRowUpdateBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "admin.db.edit_entries").await?;
    let table = sanitize_identifier(&table)?;
    if is_mutation_blocked(&table) {
        return Err(AppError::forbidden(
            "This table cannot be edited through the database explorer",
        ));
    }
    if !table_exists(&state.pool, &table).await? {
        return Err(AppError::not_found("Table not found"));
    }

    let columns = load_table_columns(&state.pool, &table).await?;
    let allowed_cols: HashMap<String, &TableColumnMeta> =
        columns.iter().map(|c| (c.name.clone(), c)).collect();

    let changes = match &body.changes {
        serde_json::Value::Object(m) if !m.is_empty() => m,
        _ => return Err(AppError::bad_request("changes object is required")),
    };

    if body.primary_key.is_empty() {
        return Err(AppError::bad_request("primaryKey is required"));
    }

    let mut qb = QueryBuilder::new(format!(r#"UPDATE "public"."{table}" SET "#));
    let mut separated = qb.separated(", ");
    let mut updated_fields: Vec<String> = Vec::new();

    for (key, value) in changes {
        let col = sanitize_identifier(key)?;
        if is_non_editable_column(&col) {
            continue;
        }
        let Some(meta) = allowed_cols.get(&col) else {
            return Err(AppError::bad_request(format!("Unknown column: {col}")));
        };
        if meta.is_primary_key {
            return Err(AppError::bad_request("Primary key columns cannot be updated"));
        }
        if value.is_null() && !meta.is_nullable {
            return Err(AppError::bad_request(format!(
                "Column '{col}' ({}) cannot be set to NULL",
                meta.data_type
            )));
        }
        separated.push(format!(r#""{col}" = "#));
        separated.push_bind_unseparated(value.clone());
        updated_fields.push(col);
    }

    if updated_fields.is_empty() {
        return Err(AppError::bad_request("No editable fields in changes"));
    }

    qb.push(" WHERE ");
    let mut where_sep = qb.separated(" AND ");
    for pk in &body.primary_key {
        let col = sanitize_identifier(&pk.column)?;
        if !allowed_cols.contains_key(&col) {
            return Err(AppError::bad_request(format!("Unknown key column: {col}")));
        }
        where_sep.push(format!(r#""{col}" = "#));
        where_sep.push_bind_unseparated(pk.value.clone());
    }

    let result = qb.build().execute(&state.pool).await?;
    let updated_count = result.rows_affected();

    write_db_audit(
        &state.pool,
        &user.id,
        "admin.db.row_update",
        "database_table",
        &table,
        Some(serde_json::json!({
            "primaryKey": body.primary_key,
            "updatedFields": updated_fields,
            "updatedCount": updated_count,
        })),
        &headers,
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "updatedCount": updated_count,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbRowDeleteBody {
    primary_key: Vec<PrimaryKeyValue>,
}

// Human: Deletes require an explicit primary key payload so accidental table wipes are impossible.
// Agent: DELETE /admin/db/tables/{table}/rows; REQUIRES admin.db.delete_entries; blocked tables 403; AUDIT admin.db.row_delete.

async fn db_table_row_delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(table): Path<String>,
    Json(body): Json<DbRowDeleteBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "admin.db.delete_entries").await?;
    let table = sanitize_identifier(&table)?;
    if is_mutation_blocked(&table) {
        return Err(AppError::forbidden(
            "This table cannot be modified through the database explorer",
        ));
    }
    if !table_exists(&state.pool, &table).await? {
        return Err(AppError::not_found("Table not found"));
    }

    let columns = load_table_columns(&state.pool, &table).await?;
    let allowed_cols: HashMap<String, &TableColumnMeta> =
        columns.iter().map(|c| (c.name.clone(), c)).collect();

    if body.primary_key.is_empty() {
        return Err(AppError::bad_request("primaryKey is required"));
    }

    let mut qb = QueryBuilder::new(format!(r#"DELETE FROM "public"."{table}" WHERE "#));
    let mut where_sep = qb.separated(" AND ");
    for pk in &body.primary_key {
        let col = sanitize_identifier(&pk.column)?;
        if !allowed_cols.contains_key(&col) {
            return Err(AppError::bad_request(format!("Unknown key column: {col}")));
        }
        where_sep.push(format!(r#""{col}" = "#));
        where_sep.push_bind_unseparated(pk.value.clone());
    }

    let result = qb.build().execute(&state.pool).await?;
    let deleted_count = result.rows_affected();

    write_db_audit(
        &state.pool,
        &user.id,
        "admin.db.row_delete",
        "database_table",
        &table,
        Some(serde_json::json!({
            "primaryKey": body.primary_key,
            "deletedCount": deleted_count,
        })),
        &headers,
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "deletedCount": deleted_count,
    })))
}

#[derive(Deserialize)]
struct DbSqlRequest {
    query: String,
}

fn validate_readonly_sql(query: &str) -> Result<(), AppError> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err(AppError::bad_request("Query is required"));
    }
    if trimmed.contains(';') {
        return Err(AppError::bad_request("Only a single SQL statement is allowed"));
    }
    let upper = trimmed.to_uppercase();
    if !(upper.starts_with("SELECT") || upper.starts_with("WITH") || upper.starts_with("EXPLAIN")) {
        return Err(AppError::bad_request(
            "Only SELECT, WITH, or EXPLAIN statements are allowed",
        ));
    }
    if FORBIDDEN_SQL.is_match(trimmed) {
        return Err(AppError::bad_request(
            "Query contains disallowed keywords for the read-only SQL lab",
        ));
    }
    Ok(())
}

// Human: Optional SQL lab for power users runs inside a read-only transaction so writable CTEs cannot persist.
// Agent: POST /admin/db/sql; REQUIRES admin.db.query; SET TRANSACTION READ ONLY; LIMIT 500; AUDIT admin.db.sql_query.

async fn db_sql_readonly(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<DbSqlRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_permission(&state.pool, &user.id, "admin.db.query").await?;
    let query = body.query.trim();
    validate_readonly_sql(query)?;

    let mut tx = state.pool.begin().await?;
    sqlx::query("SET TRANSACTION READ ONLY")
        .execute(&mut *tx)
        .await?;

    let wrapped = format!(
        "SELECT row_to_json(t) FROM ({query}) t LIMIT {MAX_SQL_ROWS}"
    );
    let rows: Vec<serde_json::Value> = sqlx::query_scalar(&wrapped)
        .fetch_all(&mut *tx)
        .await?;

    tx.rollback().await?;

    write_db_audit(
        &state.pool,
        &user.id,
        "admin.db.sql_query",
        "system_settings",
        "db_sql_lab",
        Some(serde_json::json!({
            "queryPrefix": query.chars().take(120).collect::<String>(),
            "rowCount": rows.len(),
        })),
        &headers,
    );

    Ok(Json(serde_json::json!({
        "rows": rows,
        "limit": MAX_SQL_ROWS,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_readonly_sql_rejects_writable_cte() {
        let q = "WITH x AS (DELETE FROM users RETURNING *) SELECT * FROM x";
        assert!(validate_readonly_sql(q).is_err());
    }

    #[test]
    fn validate_readonly_sql_accepts_select() {
        assert!(validate_readonly_sql("SELECT 1").is_ok());
    }

    #[test]
    fn sanitize_identifier_rejects_injection() {
        assert!(sanitize_identifier("users;drop").is_err());
    }
}
