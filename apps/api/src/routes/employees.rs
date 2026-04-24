//! Employee management: CRUD for employee records, additional emails, manager links, and optional
//! platform-user account creation/linking.

// Human: Employees are company-level records that can optionally be linked to a cloudwrkz user account.
// Agent: router /employees; check_permission employees.*; JSON responses; create_user auto-creation flow.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;

use crate::auth::extractors::AuthUser;
use crate::command_queue::{MutationQueuedResponse, MutationRunContext};
use crate::error::AppError;
use crate::job_queue::entity_creates;
use crate::routes::AppState;
use crate::routes::helpers::{check_permission, hash_json_for_idempotency, idempotency_key_from_headers};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/employees", get(list_employees).post(create_employee))
        .route("/employees/check-email", get(check_email))
        .route(
            "/employees/{id}",
            get(get_employee).patch(update_employee).delete(delete_employee),
        )
        .route("/employees/{id}/emails", post(add_employee_email))
        .route(
            "/employees/{id}/emails/{email_id}",
            delete(remove_employee_email),
        )
        .route("/employees/{id}/managers", post(add_employee_manager))
        .route(
            "/employees/{id}/managers/{manager_id}",
            delete(remove_employee_manager),
        )
        .route("/employees/{id}/link-user", post(link_user))
        .route("/employees/{id}/unlink-user", post(unlink_user))
}

// ---------------------------------------------------------------------------
// Query / request structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ListEmployeesQuery {
    page: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CheckEmailQuery {
    email: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateEmployeeRequest {
    first_name: String,
    last_name: String,
    email: String,
    title: Option<String>,
    employee_status: Option<String>,
    company_role: Option<String>,
    department: Option<String>,
    monthly_salary: Option<f64>,
    monthly_expenses: Option<f64>,
    hours_worked: Option<f64>,
    vacation_available: Option<i32>,
    vacation_used: Option<i32>,
    vacation_planned: Option<i32>,
    sick_days_total: Option<i32>,
    sick_days_available: Option<i32>,
    /// Auto-create a new user account using the employee's email
    create_user_account: Option<bool>,
    /// Link to an already-existing user account by user ID
    link_existing_user_id: Option<String>,
    /// Additional e-mails to add immediately
    additional_emails: Option<Vec<AdditionalEmailInput>>,
    /// Manager employee IDs to link immediately
    manager_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdditionalEmailInput {
    email: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEmployeeRequest {
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    title: Option<String>,
    employee_status: Option<String>,
    company_role: Option<String>,
    department: Option<String>,
    monthly_salary: Option<f64>,
    monthly_expenses: Option<f64>,
    hours_worked: Option<f64>,
    vacation_available: Option<i32>,
    vacation_used: Option<i32>,
    vacation_planned: Option<i32>,
    sick_days_total: Option<i32>,
    sick_days_available: Option<i32>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddEmailRequest {
    email: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddManagerRequest {
    manager_employee_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkUserRequest {
    user_id: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_employee_status(s: &str) -> bool {
    matches!(
        s.to_uppercase().as_str(),
        "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "PROBATION" | "TERMINATED"
    )
}

async fn enqueue_employee_job(
    state: &AppState,
    user_id: &str,
    route: String,
    body_hash: u64,
    idempotency_key: Option<String>,
    job_type: &str,
    mut payload: serde_json::Value,
    message: &str,
) -> Result<Response, AppError> {
    if let Some(ref ik) = idempotency_key {
        if !ik.trim().is_empty() {
            if let Some(cached) = state
                .mutation_broker
                .idempotency
                .get(user_id, &ik.trim().to_string(), &route, body_hash)
                .await
            {
                return Ok((cached.status, Json(cached.body)).into_response());
            }
        }
    }
    payload["user_id"] = json!(user_id);
    payload["route"] = json!(route);
    payload["body_hash"] = json!(body_hash);
    payload["idempotency_key"] = json!(idempotency_key);

    let job_id = entity_creates::enqueue_entity_create_job(&state.pool, job_type, user_id, payload)
        .await
        .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: message.into(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(job_type.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

/// Fetch emails + managers for a single employee and return a full JSON value.
async fn employee_full_json(
    pool: &sqlx::PgPool,
    employee_id: &str,
) -> Result<serde_json::Value, AppError> {
    let row = sqlx::query(
        r#"SELECT e.id, e.first_name, e.last_name, e.email, e.title,
                  e.employee_status::text AS employee_status,
                  e.company_role, e.department,
                  e.monthly_salary::float8     AS monthly_salary,
                  e.monthly_expenses::float8   AS monthly_expenses,
                  e.hours_worked::float8       AS hours_worked,
                  e.vacation_available, e.vacation_used, e.vacation_planned,
                  e.sick_days_total, e.sick_days_available,
                  e.linked_user_id, e.created_at, e.updated_at,
                  u.email AS linked_user_email, u.name AS linked_user_name
           FROM employees e
           LEFT JOIN users u ON e.linked_user_id = u.id
           WHERE e.id = $1"#,
    )
    .bind(employee_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Employee not found"))?;

    let emails: Vec<serde_json::Value> = sqlx::query(
        "SELECT id, email, label, created_at FROM employee_emails WHERE employee_id = $1 ORDER BY created_at ASC",
    )
    .bind(employee_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| {
        json!({
            "id": r.get::<String, _>("id"),
            "email": r.get::<String, _>("email"),
            "label": r.get::<Option<String>, _>("label"),
            "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
        })
    })
    .collect();

    let managers: Vec<serde_json::Value> = sqlx::query(
        r#"SELECT e.id, e.first_name, e.last_name, e.email
           FROM employee_managers m
           JOIN employees e ON m.manager_employee_id = e.id
           WHERE m.employee_id = $1
           ORDER BY e.last_name ASC, e.first_name ASC"#,
    )
    .bind(employee_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| {
        json!({
            "id": r.get::<String, _>("id"),
            "firstName": r.get::<String, _>("first_name"),
            "lastName": r.get::<String, _>("last_name"),
            "email": r.get::<String, _>("email"),
        })
    })
    .collect();

    let linked_user: Option<serde_json::Value> =
        if let Some(uid) = row.get::<Option<String>, _>("linked_user_id") {
            Some(json!({
                "id": uid,
                "email": row.get::<Option<String>, _>("linked_user_email"),
                "name": row.get::<Option<String>, _>("linked_user_name"),
            }))
        } else {
            None
        };

    Ok(json!({
        "id": row.get::<String, _>("id"),
        "firstName": row.get::<String, _>("first_name"),
        "lastName": row.get::<String, _>("last_name"),
        "email": row.get::<String, _>("email"),
        "title": row.get::<Option<String>, _>("title"),
        "employeeStatus": row.get::<String, _>("employee_status"),
        "companyRole": row.get::<Option<String>, _>("company_role"),
        "department": row.get::<Option<String>, _>("department"),
        "monthlySalary": row.get::<Option<f64>, _>("monthly_salary"),
        "monthlyExpenses": row.get::<Option<f64>, _>("monthly_expenses"),
        "hoursWorked": row.get::<Option<f64>, _>("hours_worked"),
        "vacationAvailable": row.get::<i32, _>("vacation_available"),
        "vacationUsed": row.get::<i32, _>("vacation_used"),
        "vacationPlanned": row.get::<i32, _>("vacation_planned"),
        "sickDaysTotal": row.get::<i32, _>("sick_days_total"),
        "sickDaysAvailable": row.get::<i32, _>("sick_days_available"),
        "linkedUserId": row.get::<Option<String>, _>("linked_user_id"),
        "linkedUser": linked_user,
        "emails": emails,
        "managers": managers,
        "createdAt": row.get::<chrono::NaiveDateTime, _>("created_at"),
        "updatedAt": row.get::<chrono::NaiveDateTime, _>("updated_at"),
    }))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// Human: List employees with optional search on name/email and status filter; paginated.
// Agent: check employees.view; COUNT(*) then SELECT list; JSON page/total/data envelope.

async fn list_employees(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<ListEmployeesQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.view").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(50).min(200).max(1);
    let offset: i64 = (page - 1) as i64 * limit as i64;

    let search_pat: Option<String> = q.search.as_ref().and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(format!("%{t}%")) }
    });

    let status_filter: Option<String> = q.status.as_ref().and_then(|s| {
        let t = s.trim().to_uppercase();
        if t.is_empty() { None } else { Some(t) }
    });

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM employees e
           WHERE ($1::text IS NULL OR e.employee_status::text = $1)
             AND ($2::text IS NULL OR
                  e.first_name ILIKE $2 OR e.last_name ILIKE $2 OR e.email ILIKE $2 OR
                  e.company_role ILIKE $2 OR e.department ILIKE $2)"#,
    )
    .bind(&status_filter)
    .bind(&search_pat)
    .fetch_one(&state.pool)
    .await?;

    let rows = sqlx::query(
        r#"SELECT e.id, e.first_name, e.last_name, e.email, e.title,
                  e.employee_status::text AS employee_status,
                  e.company_role, e.department,
                  e.monthly_salary::float8   AS monthly_salary,
                  e.monthly_expenses::float8 AS monthly_expenses,
                  e.hours_worked::float8     AS hours_worked,
                  e.vacation_available, e.vacation_used, e.vacation_planned,
                  e.sick_days_total, e.sick_days_available,
                  e.linked_user_id, e.created_at, e.updated_at,
                  u.email AS linked_user_email, u.name AS linked_user_name
           FROM employees e
           LEFT JOIN users u ON e.linked_user_id = u.id
           WHERE ($1::text IS NULL OR e.employee_status::text = $1)
             AND ($2::text IS NULL OR
                  e.first_name ILIKE $2 OR e.last_name ILIKE $2 OR e.email ILIKE $2 OR
                  e.company_role ILIKE $2 OR e.department ILIKE $2)
           ORDER BY e.last_name ASC, e.first_name ASC
           LIMIT $3 OFFSET $4"#,
    )
    .bind(&status_filter)
    .bind(&search_pat)
    .bind(limit as i64)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let linked_user: Option<serde_json::Value> =
                if let Some(uid) = r.get::<Option<String>, _>("linked_user_id") {
                    Some(json!({
                        "id": uid,
                        "email": r.get::<Option<String>, _>("linked_user_email"),
                        "name": r.get::<Option<String>, _>("linked_user_name"),
                    }))
                } else {
                    None
                };
            json!({
                "id": r.get::<String, _>("id"),
                "firstName": r.get::<String, _>("first_name"),
                "lastName": r.get::<String, _>("last_name"),
                "email": r.get::<String, _>("email"),
                "title": r.get::<Option<String>, _>("title"),
                "employeeStatus": r.get::<String, _>("employee_status"),
                "companyRole": r.get::<Option<String>, _>("company_role"),
                "department": r.get::<Option<String>, _>("department"),
                "monthlySalary": r.get::<Option<f64>, _>("monthly_salary"),
                "monthlyExpenses": r.get::<Option<f64>, _>("monthly_expenses"),
                "hoursWorked": r.get::<Option<f64>, _>("hours_worked"),
                "vacationAvailable": r.get::<i32, _>("vacation_available"),
                "vacationUsed": r.get::<i32, _>("vacation_used"),
                "vacationPlanned": r.get::<i32, _>("vacation_planned"),
                "sickDaysTotal": r.get::<i32, _>("sick_days_total"),
                "sickDaysAvailable": r.get::<i32, _>("sick_days_available"),
                "linkedUserId": r.get::<Option<String>, _>("linked_user_id"),
                "linkedUser": linked_user,
                "createdAt": r.get::<chrono::NaiveDateTime, _>("created_at"),
                "updatedAt": r.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect();

    let total_pages = ((total as f64) / (limit as f64)).ceil() as i64;
    Ok(Json(json!({
        "employees": data,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
    })))
}

// Human: Check whether a platform user account already exists for the given email before auto-creating one.
// Agent: check employees.create; SELECT id email name from users by email; return exists flag + user summary.

async fn check_email(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<CheckEmailQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.create").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let email = q
        .email
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::bad_request("email query parameter is required"))?;

    let existing = sqlx::query(
        "SELECT id, email, name FROM users WHERE lower(email) = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?;

    if let Some(row) = existing {
        Ok(Json(json!({
            "exists": true,
            "user": {
                "id": row.get::<String, _>("id"),
                "email": row.get::<String, _>("email"),
                "name": row.get::<Option<String>, _>("name"),
            }
        })))
    } else {
        Ok(Json(json!({ "exists": false, "user": null })))
    }
}

// Human: Fetch a single employee with their emails, managers, and linked-user summary.
// Agent: check employees.view; employee_full_json; 404 on missing.

async fn get_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.view").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let data = employee_full_json(&state.pool, &id).await?;
    Ok(Json(json!({ "employee": data })))
}

// Human: Create an employee record; optionally auto-create a user account or link an existing one.
// Agent: check employees.create; validate status; INSERT employee; INSERT additional emails+managers; optionally INSERT user or SET linked_user_id.

async fn create_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<CreateEmployeeRequest>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.create").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }
    let first_name = body.first_name.trim();
    let last_name = body.last_name.trim();
    if first_name.is_empty() || last_name.is_empty() {
        return Err(AppError::bad_request("First name and last name are required"));
    }
    let email = body.email.trim();
    if email.is_empty() || !email.contains('@') {
        return Err(AppError::bad_request("A valid email address is required"));
    }
    if let Some(ref s) = body.employee_status {
        if !validate_employee_status(s) {
            return Err(AppError::bad_request("Invalid employee status"));
        }
    }
    let body_hash = hash_json_for_idempotency(&body);
    let route = "POST /employees".to_string();
    let ctx = MutationRunContext {
        user_id: user.id.clone(),
        route: route.clone(),
        idempotency_key: idempotency_key_from_headers(&headers),
        body_hash,
    };
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee create: {e}")))?;
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        ctx.body_hash,
        ctx.idempotency_key,
        entity_creates::JOB_TYPE_EMPLOYEE_CREATE,
        json!({ "request": request_json }),
        "Employee creation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Partial update for any employee field; only provided fields are changed.
// Agent: check employees.update; COALESCE-based UPDATE; return full record.

async fn update_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<UpdateEmployeeRequest>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    if let Some(ref s) = body.employee_status {
        if !validate_employee_status(s) {
            return Err(AppError::bad_request("Invalid employee status"));
        }
    }
    let body_hash = hash_json_for_idempotency(&body);
    let route = format!("PATCH /employees/{id}");
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee update: {e}")))?;
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        body_hash,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_UPDATE,
        json!({ "employee_id": id, "request": request_json }),
        "Employee update is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Delete an employee record; cascades to emails and manager links via FK.
// Agent: check employees.delete; DELETE WHERE id; 404 if not found.

async fn delete_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.delete").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let route = format!("DELETE /employees/{id}");
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        0,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_DELETE,
        json!({ "employee_id": id }),
        "Employee deletion is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Add an additional email address to an employee record.
// Agent: check employees.update; validate email; INSERT employee_emails; return updated employee.

async fn add_employee_email(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<AddEmailRequest>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let email = body.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(AppError::bad_request("A valid email address is required"));
    }

    let route = format!("POST /employees/{id}/emails");
    let body_hash = hash_json_for_idempotency(&body);
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee add email: {e}")))?;
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        body_hash,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_ADD_EMAIL,
        json!({ "employee_id": id, "request": request_json }),
        "Employee email add is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Remove an additional email from an employee.
// Agent: check employees.update; DELETE employee_emails by id+employee_id; return updated employee.

async fn remove_employee_email(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, email_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let route = format!("DELETE /employees/{id}/emails/{email_id}");
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        0,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_REMOVE_EMAIL,
        json!({ "employee_id": id, "email_id": email_id }),
        "Employee email removal is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Link another employee as a manager of this employee.
// Agent: check employees.update; validate manager exists + not self; INSERT employee_managers ON CONFLICT DO NOTHING.

async fn add_employee_manager(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<AddManagerRequest>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    if body.manager_employee_id == id {
        return Err(AppError::bad_request(
            "An employee cannot be their own manager",
        ));
    }

    let route = format!("POST /employees/{id}/managers");
    let body_hash = hash_json_for_idempotency(&body);
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee add manager: {e}")))?;
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        body_hash,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_ADD_MANAGER,
        json!({ "employee_id": id, "request": request_json }),
        "Employee manager add is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Remove a manager relationship from an employee.
// Agent: check employees.update; DELETE employee_managers; return updated employee.

async fn remove_employee_manager(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, manager_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let route = format!("DELETE /employees/{id}/managers/{manager_id}");
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        0,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_REMOVE_MANAGER,
        json!({ "employee_id": id, "manager_employee_id": manager_id }),
        "Employee manager removal is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Set the linked_user_id on an employee to connect it to a platform user account.
// Agent: check employees.update; verify user exists; UPDATE employees.linked_user_id; return updated employee.

async fn link_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<LinkUserRequest>,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let route = format!("POST /employees/{id}/link-user");
    let body_hash = hash_json_for_idempotency(&body);
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee link user: {e}")))?;
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        body_hash,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_LINK_USER,
        json!({ "employee_id": id, "request": request_json }),
        "Employee user-link is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

// Human: Clear the linked_user_id from an employee, severing the platform-account association.
// Agent: check employees.update; UPDATE linked_user_id = NULL; return updated employee.

async fn unlink_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if !check_permission(&state.pool, &user.id, "employees.update").await
        && user.role != "ADMIN"
    {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    let route = format!("POST /employees/{id}/unlink-user");
    enqueue_employee_job(
        &state,
        &user.id,
        route,
        0,
        idempotency_key_from_headers(&headers),
        entity_creates::JOB_TYPE_EMPLOYEE_UNLINK_USER,
        json!({ "employee_id": id }),
        "Employee user-unlink is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.",
    )
    .await
}

