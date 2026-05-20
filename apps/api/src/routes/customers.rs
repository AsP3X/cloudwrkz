//! Customer management: individuals and companies with contacts and per-contact employee hourly rates.
//!
//! Customers are module-independent records that other modules may optionally reference via `customer_id`.

// Human: Customers can be a single person or a company; billing defaults live on the customer with optional per-contact/per-employee overrides.
// Agent: router /customers; check_permission customers.*; module gate customers enabled; sync SQL writes; nested contacts + employee rates.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::db::numbering::next_customer_number;
use crate::error::AppError;
use crate::id::new_cuid;
use crate::models::user::CurrentUser;
use crate::routes::AppState;
use crate::routes::helpers::check_permission;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/customers", get(list_customers).post(create_customer))
        .route(
            "/customers/{id}",
            get(get_customer)
                .patch(update_customer)
                .delete(delete_customer),
        )
        .route("/customers/{id}/contacts", post(add_contact))
        .route(
            "/customers/{id}/contacts/{contact_id}",
            put(update_contact).delete(remove_contact),
        )
        .route(
            "/customers/{id}/contacts/{contact_id}/employee-rates",
            post(set_contact_employee_rate),
        )
        .route(
            "/customers/{id}/contacts/{contact_id}/employee-rates/{employee_id}",
            delete(remove_contact_employee_rate),
        )
}

// ---------------------------------------------------------------------------
// Query / request structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ListCustomersQuery {
    page: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
    status: Option<String>,
    customer_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContactInput {
    first_name: String,
    last_name: String,
    email: Option<String>,
    phone: Option<String>,
    title: Option<String>,
    is_primary: Option<bool>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateCustomerRequest {
    customer_type: String,
    status: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    company_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    postal_code: Option<String>,
    country: Option<String>,
    notes: Option<String>,
    default_hourly_rate: Option<f64>,
    /// For COMPANY customers, initial contacts to create alongside the record.
    contacts: Option<Vec<ContactInput>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCustomerRequest {
    status: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    company_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    postal_code: Option<String>,
    country: Option<String>,
    notes: Option<String>,
    default_hourly_rate: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetEmployeeRateRequest {
    employee_id: String,
    hourly_rate: f64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_customer_type(s: &str) -> bool {
    matches!(s.to_uppercase().as_str(), "INDIVIDUAL" | "COMPANY")
}

fn validate_customer_status(s: &str) -> bool {
    matches!(s.to_uppercase().as_str(), "ACTIVE" | "INACTIVE")
}

async fn customers_module_enabled(pool: &sqlx::PgPool) -> bool {
    sqlx::query_scalar("SELECT enabled FROM modules WHERE key = 'customers'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

async fn require_customers_view(state: &AppState, user: &CurrentUser) -> Result<(), AppError> {
    if !check_permission(&state.pool, &user.id, "customers.view").await && user.role != "ADMIN" {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    Ok(())
}

async fn require_customers_create(state: &AppState, user: &CurrentUser) -> Result<(), AppError> {
    if !check_permission(&state.pool, &user.id, "customers.create").await && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    Ok(())
}

async fn require_customers_update(state: &AppState, user: &CurrentUser) -> Result<(), AppError> {
    if !check_permission(&state.pool, &user.id, "customers.update").await && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    Ok(())
}

async fn require_customers_delete(state: &AppState, user: &CurrentUser) -> Result<(), AppError> {
    if !check_permission(&state.pool, &user.id, "customers.delete").await && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    Ok(())
}

fn customer_display_name(
    customer_type: &str,
    first_name: Option<&str>,
    last_name: Option<&str>,
    company_name: Option<&str>,
) -> String {
    if customer_type == "COMPANY" {
        company_name.unwrap_or("Company").to_string()
    } else {
        format!(
            "{} {}",
            first_name.unwrap_or(""),
            last_name.unwrap_or("")
        )
        .trim()
        .to_string()
    }
}

async fn customer_exists(pool: &sqlx::PgPool, customer_id: &str) -> Result<bool, AppError> {
    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM customers WHERE id = $1 AND archived_at IS NULL")
            .bind(customer_id)
            .fetch_optional(pool)
            .await?;
    Ok(exists.is_some())
}

async fn contact_belongs_to_customer(
    pool: &sqlx::PgPool,
    customer_id: &str,
    contact_id: &str,
) -> Result<bool, AppError> {
    let exists: Option<String> = sqlx::query_scalar(
        "SELECT id FROM customer_contacts WHERE id = $1 AND customer_id = $2",
    )
    .bind(contact_id)
    .bind(customer_id)
    .fetch_optional(pool)
    .await?;
    Ok(exists.is_some())
}

async fn insert_contact(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    customer_id: &str,
    input: &ContactInput,
) -> Result<String, AppError> {
    let contact_id = new_cuid();
    let first_name = input.first_name.trim();
    let last_name = input.last_name.trim();
    if first_name.is_empty() || last_name.is_empty() {
        return Err(AppError::bad_request("Contact first and last name are required"));
    }
    if input.is_primary == Some(true) {
        sqlx::query("UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1")
            .bind(customer_id)
            .execute(&mut **tx)
            .await?;
    }
    sqlx::query(
        r#"INSERT INTO customer_contacts
           (id, customer_id, first_name, last_name, email, phone, title, is_primary, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"#,
    )
    .bind(&contact_id)
    .bind(customer_id)
    .bind(first_name)
    .bind(last_name)
    .bind(input.email.as_deref().map(str::trim))
    .bind(input.phone.as_deref().map(str::trim))
    .bind(input.title.as_deref().map(str::trim))
    .bind(input.is_primary.unwrap_or(false))
    .bind(input.notes.as_deref().map(str::trim))
    .execute(&mut **tx)
    .await?;
    Ok(contact_id)
}

/// Fetch contacts + nested employee rates for a customer and return full JSON.
async fn customer_full_json(
    pool: &sqlx::PgPool,
    customer_id: &str,
) -> Result<serde_json::Value, AppError> {
    let row = sqlx::query(
        r#"SELECT id, customer_number, customer_type::text AS customer_type,
                  status::text AS status,
                  first_name, last_name, company_name,
                  email, phone, address_line1, address_line2, city, postal_code, country,
                  notes, default_hourly_rate::float8 AS default_hourly_rate,
                  archived_at, created_at, updated_at
           FROM customers
           WHERE id = $1"#,
    )
    .bind(customer_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Customer not found"))?;

    let customer_type: String = row.get("customer_type");
    let contacts: Vec<serde_json::Value> = sqlx::query(
        r#"SELECT id, first_name, last_name, email, phone, title, is_primary, notes, created_at, updated_at
           FROM customer_contacts
           WHERE customer_id = $1
           ORDER BY is_primary DESC, last_name ASC, first_name ASC"#,
    )
    .bind(customer_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|c| {
        json!({
            "id": c.get::<String, _>("id"),
            "firstName": c.get::<String, _>("first_name"),
            "lastName": c.get::<String, _>("last_name"),
            "email": c.get::<Option<String>, _>("email"),
            "phone": c.get::<Option<String>, _>("phone"),
            "title": c.get::<Option<String>, _>("title"),
            "isPrimary": c.get::<bool, _>("is_primary"),
            "notes": c.get::<Option<String>, _>("notes"),
            "createdAt": c.get::<chrono::NaiveDateTime, _>("created_at"),
            "updatedAt": c.get::<chrono::NaiveDateTime, _>("updated_at"),
        })
    })
    .collect();

    let mut contacts_with_rates = Vec::with_capacity(contacts.len());
    for contact in contacts {
        let contact_id = contact
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let rates: Vec<serde_json::Value> = sqlx::query(
            r#"SELECT r.id, r.employee_id, r.hourly_rate::float8 AS hourly_rate,
                      e.first_name, e.last_name, e.email
               FROM customer_contact_employee_rates r
               JOIN employees e ON e.id = r.employee_id
               WHERE r.customer_contact_id = $1
               ORDER BY e.last_name ASC, e.first_name ASC"#,
        )
        .bind(&contact_id)
        .fetch_all(pool)
        .await?
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<String, _>("id"),
                "employeeId": r.get::<String, _>("employee_id"),
                "hourlyRate": r.get::<f64, _>("hourly_rate"),
                "employee": {
                    "id": r.get::<String, _>("employee_id"),
                    "firstName": r.get::<String, _>("first_name"),
                    "lastName": r.get::<String, _>("last_name"),
                    "email": r.get::<String, _>("email"),
                },
            })
        })
        .collect();
        contacts_with_rates.push(json!({
            "id": contact.get("id"),
            "firstName": contact.get("firstName"),
            "lastName": contact.get("lastName"),
            "email": contact.get("email"),
            "phone": contact.get("phone"),
            "title": contact.get("title"),
            "isPrimary": contact.get("isPrimary"),
            "notes": contact.get("notes"),
            "employeeRates": rates,
            "createdAt": contact.get("createdAt"),
            "updatedAt": contact.get("updatedAt"),
        }));
    }

    Ok(json!({
        "id": row.get::<String, _>("id"),
        "customerNumber": row.get::<String, _>("customer_number"),
        "customerType": customer_type,
        "status": row.get::<String, _>("status"),
        "displayName": customer_display_name(
            &customer_type,
            row.get::<Option<String>, _>("first_name").as_deref(),
            row.get::<Option<String>, _>("last_name").as_deref(),
            row.get::<Option<String>, _>("company_name").as_deref(),
        ),
        "firstName": row.get::<Option<String>, _>("first_name"),
        "lastName": row.get::<Option<String>, _>("last_name"),
        "companyName": row.get::<Option<String>, _>("company_name"),
        "email": row.get::<Option<String>, _>("email"),
        "phone": row.get::<Option<String>, _>("phone"),
        "addressLine1": row.get::<Option<String>, _>("address_line1"),
        "addressLine2": row.get::<Option<String>, _>("address_line2"),
        "city": row.get::<Option<String>, _>("city"),
        "postalCode": row.get::<Option<String>, _>("postal_code"),
        "country": row.get::<Option<String>, _>("country"),
        "notes": row.get::<Option<String>, _>("notes"),
        "defaultHourlyRate": row.get::<Option<f64>, _>("default_hourly_rate"),
        "contacts": contacts_with_rates,
        "archivedAt": row.get::<Option<chrono::NaiveDateTime>, _>("archived_at"),
        "createdAt": row.get::<chrono::NaiveDateTime, _>("created_at"),
        "updatedAt": row.get::<chrono::NaiveDateTime, _>("updated_at"),
    }))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// Human: Paginated customer list with optional search across name, number, and email fields.
// Agent: READ customers WHERE archived_at IS NULL; FILTER search/status/type; RETURN page envelope.

async fn list_customers(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<ListCustomersQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_view(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Ok(Json(json!({ "customers": [], "total": 0, "page": 1, "limit": 50, "totalPages": 0 })));
    }

    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(50).min(200).max(1);
    let offset: i64 = (page - 1) as i64 * limit as i64;

    let search_pat: Option<String> = q.search.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() {
            None
        } else {
            Some(format!("%{t}%"))
        }
    });

    let status_filter: Option<String> = q.status.as_ref().and_then(|s| {
        let t = s.trim().to_uppercase();
        if t.is_empty() || !validate_customer_status(&t) {
            None
        } else {
            Some(t)
        }
    });

    let type_filter: Option<String> = q.customer_type.as_ref().and_then(|s| {
        let t = s.trim().to_uppercase();
        if t.is_empty() || !validate_customer_type(&t) {
            None
        } else {
            Some(t)
        }
    });

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM customers
           WHERE archived_at IS NULL
             AND ($1::text IS NULL OR status::text = $1)
             AND ($2::text IS NULL OR customer_type::text = $2)
             AND (
               $3::text IS NULL
               OR customer_number ILIKE $3
               OR COALESCE(first_name, '') ILIKE $3
               OR COALESCE(last_name, '') ILIKE $3
               OR COALESCE(company_name, '') ILIKE $3
               OR COALESCE(email, '') ILIKE $3
             )"#,
    )
    .bind(&status_filter)
    .bind(&type_filter)
    .bind(&search_pat)
    .fetch_one(&state.pool)
    .await?;

    let rows = sqlx::query(
        r#"SELECT id, customer_number, customer_type::text AS customer_type,
                  status::text AS status,
                  first_name, last_name, company_name, email, phone,
                  default_hourly_rate::float8 AS default_hourly_rate,
                  created_at, updated_at
           FROM customers
           WHERE archived_at IS NULL
             AND ($1::text IS NULL OR status::text = $1)
             AND ($2::text IS NULL OR customer_type::text = $2)
             AND (
               $3::text IS NULL
               OR customer_number ILIKE $3
               OR COALESCE(first_name, '') ILIKE $3
               OR COALESCE(last_name, '') ILIKE $3
               OR COALESCE(company_name, '') ILIKE $3
               OR COALESCE(email, '') ILIKE $3
             )
           ORDER BY updated_at DESC
           LIMIT $4 OFFSET $5"#,
    )
    .bind(&status_filter)
    .bind(&type_filter)
    .bind(&search_pat)
    .bind(limit as i64)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let customer_type: String = r.get("customer_type");
            json!({
                "id": r.get::<String, _>("id"),
                "customerNumber": r.get::<String, _>("customer_number"),
                "customerType": customer_type,
                "status": r.get::<String, _>("status"),
                "displayName": customer_display_name(
                    &customer_type,
                    r.get::<Option<String>, _>("first_name").as_deref(),
                    r.get::<Option<String>, _>("last_name").as_deref(),
                    r.get::<Option<String>, _>("company_name").as_deref(),
                ),
                "firstName": r.get::<Option<String>, _>("first_name"),
                "lastName": r.get::<Option<String>, _>("last_name"),
                "companyName": r.get::<Option<String>, _>("company_name"),
                "email": r.get::<Option<String>, _>("email"),
                "phone": r.get::<Option<String>, _>("phone"),
                "defaultHourlyRate": r.get::<Option<f64>, _>("default_hourly_rate"),
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect();

    let total_pages = ((total as f64) / (limit as f64)).ceil() as i64;
    Ok(Json(json!({
        "customers": data,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    })))
}

// Human: Return one customer with nested contacts and per-contact employee hourly rates.
// Agent: READ customers + customer_contacts + customer_contact_employee_rates; 404 when missing.

async fn get_customer(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_view(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::not_found("Customer not found"));
    }
    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Create an individual or company customer; individuals get an implicit primary contact row.
// Agent: TX INSERT customers + contacts; INDIVIDUAL auto primary contact; RETURN full customer JSON.

async fn create_customer(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateCustomerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_create(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }

    let customer_type = body.customer_type.trim().to_uppercase();
    if !validate_customer_type(&customer_type) {
        return Err(AppError::bad_request("customerType must be INDIVIDUAL or COMPANY"));
    }
    let status = body
        .status
        .as_deref()
        .map(|s| s.trim().to_uppercase())
        .unwrap_or_else(|| "ACTIVE".into());
    if !validate_customer_status(&status) {
        return Err(AppError::bad_request("Invalid customer status"));
    }

    if customer_type == "INDIVIDUAL" {
        let first = body.first_name.as_deref().unwrap_or("").trim();
        let last = body.last_name.as_deref().unwrap_or("").trim();
        if first.is_empty() || last.is_empty() {
            return Err(AppError::bad_request(
                "First name and last name are required for individual customers",
            ));
        }
    } else {
        let company = body.company_name.as_deref().unwrap_or("").trim();
        if company.is_empty() {
            return Err(AppError::bad_request(
                "Company name is required for company customers",
            ));
        }
    }

    let customer_id = new_cuid();
    let mut tx = state.pool.begin().await?;
    let customer_number = next_customer_number(&mut tx).await?;

    sqlx::query(
        r#"INSERT INTO customers
           (id, customer_number, customer_type, status,
            first_name, last_name, company_name, email, phone,
            address_line1, address_line2, city, postal_code, country,
            notes, default_hourly_rate)
           VALUES ($1, $2, $3::customer_type_enum, $4::customer_status_enum,
                   $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)"#,
    )
    .bind(&customer_id)
    .bind(&customer_number)
    .bind(&customer_type)
    .bind(&status)
    .bind(body.first_name.as_deref().map(str::trim))
    .bind(body.last_name.as_deref().map(str::trim))
    .bind(body.company_name.as_deref().map(str::trim))
    .bind(body.email.as_deref().map(str::trim))
    .bind(body.phone.as_deref().map(str::trim))
    .bind(body.address_line1.as_deref().map(str::trim))
    .bind(body.address_line2.as_deref().map(str::trim))
    .bind(body.city.as_deref().map(str::trim))
    .bind(body.postal_code.as_deref().map(str::trim))
    .bind(body.country.as_deref().map(str::trim))
    .bind(body.notes.as_deref().map(str::trim))
    .bind(body.default_hourly_rate)
    .execute(&mut *tx)
    .await?;

    if customer_type == "INDIVIDUAL" {
        let primary = ContactInput {
            first_name: body.first_name.clone().unwrap_or_default(),
            last_name: body.last_name.clone().unwrap_or_default(),
            email: body.email.clone(),
            phone: body.phone.clone(),
            title: None,
            is_primary: Some(true),
            notes: None,
        };
        insert_contact(&mut tx, &customer_id, &primary).await?;
    } else if let Some(ref contacts) = body.contacts {
        for contact in contacts {
            insert_contact(&mut tx, &customer_id, contact).await?;
        }
    }

    tx.commit().await?;
    let data = customer_full_json(&state.pool, &customer_id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Partial update of customer fields; does not replace contacts (use contact routes).
// Agent: PATCH customers SET COALESCE fields; TOUCH updated_at; RETURN full record.

async fn update_customer(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateCustomerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if let Some(ref s) = body.status {
        if !validate_customer_status(s) {
            return Err(AppError::bad_request("Invalid customer status"));
        }
    }
    if !customer_exists(&state.pool, &id).await? {
        return Err(AppError::not_found("Customer not found"));
    }

    let result = sqlx::query(
        r#"UPDATE customers SET
             status = COALESCE($2::customer_status_enum, status),
             first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             company_name = COALESCE($5, company_name),
             email = COALESCE($6, email),
             phone = COALESCE($7, phone),
             address_line1 = COALESCE($8, address_line1),
             address_line2 = COALESCE($9, address_line2),
             city = COALESCE($10, city),
             postal_code = COALESCE($11, postal_code),
             country = COALESCE($12, country),
             notes = COALESCE($13, notes),
             default_hourly_rate = COALESCE($14, default_hourly_rate),
             updated_at = NOW()
           WHERE id = $1 AND archived_at IS NULL"#,
    )
    .bind(&id)
    .bind(body.status.as_deref().map(|s| s.to_uppercase()))
    .bind(body.first_name.as_deref().map(str::trim))
    .bind(body.last_name.as_deref().map(str::trim))
    .bind(body.company_name.as_deref().map(str::trim))
    .bind(body.email.as_deref().map(str::trim))
    .bind(body.phone.as_deref().map(str::trim))
    .bind(body.address_line1.as_deref().map(str::trim))
    .bind(body.address_line2.as_deref().map(str::trim))
    .bind(body.city.as_deref().map(str::trim))
    .bind(body.postal_code.as_deref().map(str::trim))
    .bind(body.country.as_deref().map(str::trim))
    .bind(body.notes.as_deref().map(str::trim))
    .bind(body.default_hourly_rate)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Customer not found"));
    }

    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Hard-delete a customer; cascades contacts and employee rates via FK.
// Agent: DELETE customers WHERE id; 404 if missing; cross-module FKs SET NULL on delete.

async fn delete_customer(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_delete(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }

    let result = sqlx::query("DELETE FROM customers WHERE id = $1")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Customer not found"));
    }

    Ok(Json(json!({ "success": true })))
}

// Human: Add a contact to a company customer (or additional contact for individuals).
// Agent: INSERT customer_contacts; optional is_primary clears other primaries on same customer.

async fn add_contact(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ContactInput>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if !customer_exists(&state.pool, &id).await? {
        return Err(AppError::not_found("Customer not found"));
    }

    let mut tx = state.pool.begin().await?;
    insert_contact(&mut tx, &id, &body).await?;
    tx.commit().await?;

    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Update an existing contact; primary flag clears siblings when set true.
// Agent: UPDATE customer_contacts WHERE id + customer_id match.

async fn update_contact(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, contact_id)): Path<(String, String)>,
    Json(body): Json<ContactInput>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if !contact_belongs_to_customer(&state.pool, &id, &contact_id).await? {
        return Err(AppError::not_found("Contact not found"));
    }

    let first_name = body.first_name.trim();
    let last_name = body.last_name.trim();
    if first_name.is_empty() || last_name.is_empty() {
        return Err(AppError::bad_request("Contact first and last name are required"));
    }

    let mut tx = state.pool.begin().await?;
    if body.is_primary == Some(true) {
        sqlx::query("UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        r#"UPDATE customer_contacts SET
             first_name = $3, last_name = $4, email = $5, phone = $6,
             title = $7, is_primary = COALESCE($8, is_primary), notes = $9, updated_at = NOW()
           WHERE id = $1 AND customer_id = $2"#,
    )
    .bind(&contact_id)
    .bind(&id)
    .bind(first_name)
    .bind(last_name)
    .bind(body.email.as_deref().map(str::trim))
    .bind(body.phone.as_deref().map(str::trim))
    .bind(body.title.as_deref().map(str::trim))
    .bind(body.is_primary)
    .bind(body.notes.as_deref().map(str::trim))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Remove a contact and its employee rate rows (cascade).
// Agent: DELETE customer_contacts WHERE id; block when sole primary on company with no others.

async fn remove_contact(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, contact_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if !contact_belongs_to_customer(&state.pool, &id, &contact_id).await? {
        return Err(AppError::not_found("Contact not found"));
    }

    let result = sqlx::query("DELETE FROM customer_contacts WHERE id = $1 AND customer_id = $2")
        .bind(&contact_id)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Contact not found"));
    }

    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Set or replace the hourly rate for one employee on a specific customer contact.
// Agent: UPSERT customer_contact_employee_rates; validates employee exists.

async fn set_contact_employee_rate(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, contact_id)): Path<(String, String)>,
    Json(body): Json<SetEmployeeRateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if !contact_belongs_to_customer(&state.pool, &id, &contact_id).await? {
        return Err(AppError::not_found("Contact not found"));
    }
    if body.hourly_rate < 0.0 {
        return Err(AppError::bad_request("Hourly rate must be zero or positive"));
    }

    let employee_exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM employees WHERE id = $1")
            .bind(&body.employee_id)
            .fetch_optional(&state.pool)
            .await?;
    if employee_exists.is_none() {
        return Err(AppError::not_found("Employee not found"));
    }

    let rate_id = new_cuid();
    sqlx::query(
        r#"INSERT INTO customer_contact_employee_rates
           (id, customer_contact_id, employee_id, hourly_rate)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (customer_contact_id, employee_id)
           DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate, updated_at = NOW()"#,
    )
    .bind(&rate_id)
    .bind(&contact_id)
    .bind(&body.employee_id)
    .bind(body.hourly_rate)
    .execute(&state.pool)
    .await?;

    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}

// Human: Remove a per-contact employee rate override so billing falls back to customer default.
// Agent: DELETE customer_contact_employee_rates WHERE contact + employee match.

async fn remove_contact_employee_rate(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, contact_id, employee_id)): Path<(String, String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_customers_update(&state, &user).await?;
    if !customers_module_enabled(&state.pool).await {
        return Err(AppError::forbidden("Customers module is disabled"));
    }
    if !contact_belongs_to_customer(&state.pool, &id, &contact_id).await? {
        return Err(AppError::not_found("Contact not found"));
    }

    let result = sqlx::query(
        "DELETE FROM customer_contact_employee_rates WHERE customer_contact_id = $1 AND employee_id = $2",
    )
    .bind(&contact_id)
    .bind(&employee_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::not_found("Employee rate not found"));
    }

    let data = customer_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "customer": data })))
}
