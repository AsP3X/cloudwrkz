use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use serde_json::json;
use sqlx::{PgPool, Row};

use crate::auth::extractors::AuthUser;
use crate::command_queue::{MutationQueuedResponse, MutationRunContext};
use crate::error::AppError;
use crate::job_queue::entity_creates;
use crate::models::employee::{
    DepartmentCreateRequest, DepartmentUpdateRequest, DocumentCreateRequest,
    EmployeeAssetAssignRequest, EmployeeCertificationUpsertRequest,
    EmployeeCompensationUpsertRequest, EmployeeCreateRequest, EmployeeDetail,
    EmployeeGoalCreateRequest, EmployeeLifecycleEventCreateRequest, EmployeeListItem,
    EmployeeListParams, EmployeePerformanceReviewCreateRequest, EmployeeSkillUpsertRequest,
    EmployeeUpdateRequest, LeaveRequestCreateRequest, LeaveRequestUpdateRequest,
};
use crate::models::employee_code::{
    employee_code_identity_expr_sql, employee_code_identity_key, parse_employee_code,
};
use crate::routes::AppState;
use crate::routes::helpers::{
    check_permission, hash_json_for_idempotency, idempotency_key_from_headers,
};

pub fn router() -> Router<AppState> {
    // Human: Static paths (/org-chart, /leave, /documents) are registered before the dynamic
    // /{id} pattern so Axum's matchit router correctly resolves them as static segments first.
    // Agent: ROUTES GET /employees/org-chart, GET /employees/leave, GET /employees/documents
    //        before GET /employees/{id} to avoid shadowing.
    Router::new()
        .route("/employees", get(list_employees).post(create_employee))
        // Company-wide aggregate reads — must precede /employees/{id}
        .route("/employees/org-chart", get(get_org_chart))
        .route("/employees/leave", get(list_all_leave_requests))
        .route("/employees/documents", get(list_all_documents))
        .route("/employees/performance-summary", get(get_performance_summary))
        // Department routes (static before /{id})
        .route("/employees/departments", get(list_departments).post(create_department))
        .route(
            "/employees/departments/{dept_id}",
            get(get_department).patch(update_department).delete(delete_department),
        )
        // Per-employee resource routes
        .route(
            "/employees/{id}",
            get(get_employee)
                .patch(update_employee)
                .delete(delete_employee),
        )
        .route("/employees/{id}/compensation", post(upsert_employee_compensation))
        .route("/employees/{id}/assets", post(assign_employee_asset))
        .route("/employees/{id}/skills", post(upsert_employee_skill))
        .route("/employees/{id}/certifications", post(upsert_employee_certification))
        .route("/employees/{id}/performance-reviews", post(create_employee_performance_review))
        .route("/employees/{id}/goals", post(create_employee_goal))
        .route("/employees/{id}/lifecycle-events", post(create_employee_lifecycle_event))
        // Leave request routes (per employee)
        .route(
            "/employees/{id}/leave",
            get(list_employee_leave).post(create_leave_request),
        )
        .route(
            "/employees/{id}/leave/{leave_id}",
            patch(update_leave_request),
        )
        // Document routes (per employee)
        .route(
            "/employees/{id}/documents",
            get(list_employee_documents).post(create_document),
        )
        .route(
            "/employees/{id}/documents/{doc_id}",
            delete(delete_document),
        )
}

async fn employee_module_enabled(pool: &sqlx::PgPool) -> Result<bool, AppError> {
    let enabled: bool = sqlx::query_scalar("SELECT enabled FROM modules WHERE key = 'employees'")
        .fetch_optional(pool)
        .await?
        .unwrap_or(false);
    Ok(enabled)
}

async fn require_employee_module(pool: &sqlx::PgPool) -> Result<(), AppError> {
    if !employee_module_enabled(pool).await? {
        return Err(AppError::forbidden("Employees module is disabled"));
    }
    Ok(())
}

async fn list_employees(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<EmployeeListParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.view").await
        || check_permission(&state.pool, &user.id, "employees.view_all").await;
    if !can_view {
        return Err(AppError::forbidden(
            "You don't have permission to view employees",
        ));
    }

    let status = params.status.unwrap_or_default();
    let department = params.department.unwrap_or_default();
    let manager_employee_id = params.manager_employee_id.unwrap_or_default();
    let location = params.location.unwrap_or_default();
    let query = params.q.unwrap_or_default();
    let like = format!("%{}%", query.trim());

    let rows = sqlx::query(
        r#"SELECT id, employee_code, first_name, last_name, display_name, work_email, department,
                  job_title, location, status::text, employment_type::text, hire_date,
                  termination_date, manager_employee_id, created_at, updated_at
           FROM employees
           WHERE ($1::text = '' OR status::text = $1)
             AND ($2::text = '' OR department ILIKE $2)
             AND ($3::text = '' OR manager_employee_id = $3)
             AND ($4::text = '' OR location ILIKE $4)
             AND ($5::text = '' OR employee_code ILIKE $6 OR first_name ILIKE $6 OR last_name ILIKE $6 OR COALESCE(work_email, '') ILIKE $6)
           ORDER BY created_at DESC
           LIMIT 500"#,
    )
    .bind(status)
    .bind(department)
    .bind(manager_employee_id)
    .bind(location)
    .bind(query.trim())
    .bind(like)
    .fetch_all(&state.pool)
    .await?;

    let employees: Vec<EmployeeListItem> = rows
        .iter()
        .map(|r| EmployeeListItem {
            id: r.get("id"),
            employee_code: r.get("employee_code"),
            first_name: r.get("first_name"),
            last_name: r.get("last_name"),
            display_name: r.get("display_name"),
            work_email: r.get("work_email"),
            department: r.get("department"),
            job_title: r.get("job_title"),
            location: r.get("location"),
            status: r.get("status"),
            employment_type: r.get("employment_type"),
            hire_date: r.get("hire_date"),
            termination_date: r.get("termination_date"),
            manager_employee_id: r.get("manager_employee_id"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(json!({ "employees": employees })))
}

async fn get_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.view").await
        || check_permission(&state.pool, &user.id, "employees.view_all").await;
    if !can_view {
        return Err(AppError::forbidden(
            "You don't have permission to view employees",
        ));
    }

    let row = sqlx::query(
        r#"SELECT id, employee_code, user_id, first_name, last_name, display_name, work_email, personal_email,
                  phone, date_of_birth, hire_date, termination_date, status::text, employment_type::text, department,
                  job_title, legal_entity, location, manager_employee_id, emergency_contact, notes, payroll_external_id,
                  metadata, created_by_user_id, updated_by_user_id, created_at, updated_at
           FROM employees WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;
    let Some(r) = row else {
        return Err(AppError::not_found("Employee not found"));
    };

    let employee = EmployeeDetail {
        id: r.get("id"),
        employee_code: r.get("employee_code"),
        user_id: r.get("user_id"),
        first_name: r.get("first_name"),
        last_name: r.get("last_name"),
        display_name: r.get("display_name"),
        work_email: r.get("work_email"),
        personal_email: r.get("personal_email"),
        phone: r.get("phone"),
        date_of_birth: r.get("date_of_birth"),
        hire_date: r.get("hire_date"),
        termination_date: r.get("termination_date"),
        status: r.get("status"),
        employment_type: r.get("employment_type"),
        department: r.get("department"),
        job_title: r.get("job_title"),
        legal_entity: r.get("legal_entity"),
        location: r.get("location"),
        manager_employee_id: r.get("manager_employee_id"),
        emergency_contact: r.get("emergency_contact"),
        notes: r.get("notes"),
        payroll_external_id: r.get("payroll_external_id"),
        metadata: r.get("metadata"),
        created_by_user_id: r.get("created_by_user_id"),
        updated_by_user_id: r.get("updated_by_user_id"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    };

    let can_view_comp = check_permission(&state.pool, &user.id, "employees.compensation.view")
        .await
        || check_permission(&state.pool, &user.id, "employees.compensation.manage").await;
    let compensation = if can_view_comp {
        sqlx::query(
            r#"SELECT id, pay_frequency::text, amount_cents, currency, compensation_type, pay_grade, pay_band,
                      effective_from, effective_to, is_current, metadata, created_at, updated_at
               FROM employee_compensation
               WHERE employee_id = $1
               ORDER BY effective_from DESC"#,
        )
        .bind(&id)
        .fetch_all(&state.pool)
        .await?
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "pay_frequency": row.get::<String, _>("pay_frequency"),
                "amount_cents": row.get::<i64, _>("amount_cents"),
                "currency": row.get::<String, _>("currency"),
                "compensation_type": row.get::<String, _>("compensation_type"),
                "pay_grade": row.get::<Option<String>, _>("pay_grade"),
                "pay_band": row.get::<Option<String>, _>("pay_band"),
                "effective_from": row.get::<chrono::NaiveDate, _>("effective_from"),
                "effective_to": row.get::<Option<chrono::NaiveDate>, _>("effective_to"),
                "is_current": row.get::<bool, _>("is_current"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let assets = sqlx::query(
        r#"SELECT id, asset_name, asset_tag, serial_number, category, assigned_at, due_back_at, returned_at,
                  status::text, notes, metadata, created_at, updated_at
           FROM employee_assets
           WHERE employee_id = $1
           ORDER BY assigned_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let assets = assets
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "asset_name": row.get::<String, _>("asset_name"),
                "asset_tag": row.get::<Option<String>, _>("asset_tag"),
                "serial_number": row.get::<Option<String>, _>("serial_number"),
                "category": row.get::<Option<String>, _>("category"),
                "assigned_at": row.get::<chrono::NaiveDateTime, _>("assigned_at"),
                "due_back_at": row.get::<Option<chrono::NaiveDateTime>, _>("due_back_at"),
                "returned_at": row.get::<Option<chrono::NaiveDateTime>, _>("returned_at"),
                "status": row.get::<String, _>("status"),
                "notes": row.get::<Option<String>, _>("notes"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    let skills = sqlx::query(
        r#"SELECT id, skill_name, level, category, verified, last_used_at, notes, created_at, updated_at
           FROM employee_skills
           WHERE employee_id = $1
           ORDER BY skill_name ASC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let skills = skills
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "skill_name": row.get::<String, _>("skill_name"),
                "level": row.get::<Option<i32>, _>("level"),
                "category": row.get::<Option<String>, _>("category"),
                "verified": row.get::<bool, _>("verified"),
                "last_used_at": row.get::<Option<chrono::NaiveDate>, _>("last_used_at"),
                "notes": row.get::<Option<String>, _>("notes"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    let certifications = sqlx::query(
        r#"SELECT id, certification_name, issuer, issued_at, expires_at, credential_id, verification_url, status, metadata,
                  created_at, updated_at
           FROM employee_certifications
           WHERE employee_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let certifications = certifications
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "certification_name": row.get::<String, _>("certification_name"),
                "issuer": row.get::<Option<String>, _>("issuer"),
                "issued_at": row.get::<Option<chrono::NaiveDate>, _>("issued_at"),
                "expires_at": row.get::<Option<chrono::NaiveDate>, _>("expires_at"),
                "credential_id": row.get::<Option<String>, _>("credential_id"),
                "verification_url": row.get::<Option<String>, _>("verification_url"),
                "status": row.get::<String, _>("status"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    let performance_reviews = sqlx::query(
        r#"SELECT id, reviewer_employee_id, cycle_name, rating::text AS rating, summary, strengths, improvements, reviewed_at,
                  metadata, created_at, updated_at
           FROM employee_performance_reviews
           WHERE employee_id = $1
           ORDER BY reviewed_at DESC NULLS LAST, created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let performance_reviews = performance_reviews
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "reviewer_employee_id": row.get::<Option<String>, _>("reviewer_employee_id"),
                "cycle_name": row.get::<String, _>("cycle_name"),
                "rating": row.get::<Option<String>, _>("rating"),
                "summary": row.get::<Option<String>, _>("summary"),
                "strengths": row.get::<Option<String>, _>("strengths"),
                "improvements": row.get::<Option<String>, _>("improvements"),
                "reviewed_at": row.get::<Option<chrono::NaiveDate>, _>("reviewed_at"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    let goals = sqlx::query(
        r#"SELECT id, title, description, status, target_date, progress_percent, metadata, created_at, updated_at
           FROM employee_goals
           WHERE employee_id = $1
           ORDER BY target_date ASC NULLS LAST, created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let goals = goals
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "title": row.get::<String, _>("title"),
                "description": row.get::<Option<String>, _>("description"),
                "status": row.get::<String, _>("status"),
                "target_date": row.get::<Option<chrono::NaiveDate>, _>("target_date"),
                "progress_percent": row.get::<i32, _>("progress_percent"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    let lifecycle_events = sqlx::query(
        r#"SELECT id, event_type::text, status::text, title, description, due_at, completed_at, owner_user_id, metadata,
                  created_at, updated_at
           FROM employee_lifecycle_events
           WHERE employee_id = $1
           ORDER BY due_at ASC NULLS LAST, created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let lifecycle_events = lifecycle_events
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<String, _>("id"),
                "event_type": row.get::<String, _>("event_type"),
                "status": row.get::<String, _>("status"),
                "title": row.get::<String, _>("title"),
                "description": row.get::<Option<String>, _>("description"),
                "due_at": row.get::<Option<chrono::NaiveDateTime>, _>("due_at"),
                "completed_at": row.get::<Option<chrono::NaiveDateTime>, _>("completed_at"),
                "owner_user_id": row.get::<Option<String>, _>("owner_user_id"),
                "metadata": row.get::<Option<serde_json::Value>, _>("metadata"),
                "created_at": row.get::<chrono::NaiveDateTime, _>("created_at"),
                "updated_at": row.get::<chrono::NaiveDateTime, _>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(json!({
        "employee": employee,
        "compensation": compensation,
        "assets": assets,
        "skills": skills,
        "certifications": certifications,
        "performance_reviews": performance_reviews,
        "goals": goals,
        "lifecycle_events": lifecycle_events
    })))
}

async fn queue_employee_mutation<T: serde::Serialize>(
    state: &AppState,
    user_id: &str,
    route: String,
    headers: &HeaderMap,
    body: &T,
    job_type: &str,
    mut payload: serde_json::Value,
) -> Result<Response, AppError> {
    let body_hash = hash_json_for_idempotency(body);
    let ctx = MutationRunContext {
        user_id: user_id.to_string(),
        route,
        idempotency_key: idempotency_key_from_headers(headers),
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

    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "user_id".to_string(),
            serde_json::Value::String(user_id.to_string()),
        );
        obj.insert(
            "route".to_string(),
            serde_json::Value::String(ctx.route.clone()),
        );
        obj.insert(
            "body_hash".to_string(),
            serde_json::Value::Number(serde_json::Number::from(ctx.body_hash)),
        );
        obj.insert(
            "idempotency_key".to_string(),
            ctx.idempotency_key
                .as_ref()
                .map(|v| serde_json::Value::String(v.clone()))
                .unwrap_or(serde_json::Value::Null),
        );
    }

    let job_id = entity_creates::enqueue_entity_create_job(&state.pool, job_type, user_id, payload)
        .await
        .map_err(AppError::from)?;
    let q = MutationQueuedResponse {
        message: "Employee mutation is processing in the background. Poll GET /api/v1/mutation-jobs/{job_id} until status is completed.".to_string(),
        queued: true,
        job_id,
        retry_deadline_secs: entity_creates::ENTITY_CREATE_POLL_DEADLINE_SECS,
        job_type: Some(job_type.to_string()),
    };
    Ok((StatusCode::ACCEPTED, Json(q)).into_response())
}

async fn employee_code_identity_in_use(pool: &PgPool, identity_key: &str) -> Result<bool, AppError> {
    let sql = format!(
        "SELECT EXISTS(SELECT 1 FROM employees WHERE {} = $1)",
        employee_code_identity_expr_sql()
    );
    sqlx::query_scalar(&sql)
        .bind(identity_key)
        .fetch_one(pool)
        .await
        .map_err(AppError::from)
}

async fn create_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(mut body): Json<EmployeeCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.create").await {
        return Err(AppError::forbidden(
            "You don't have permission to create employees",
        ));
    }
    let code = parse_employee_code(&body.employee_code).map_err(AppError::bad_request)?;
    let identity = employee_code_identity_key(&code);
    if employee_code_identity_in_use(&state.pool, &identity).await? {
        return Err(AppError::bad_request(
            "An employee with this employee code already exists",
        ));
    }
    body.employee_code = code;

    if body.first_name.trim().is_empty() || body.last_name.trim().is_empty() {
        return Err(AppError::bad_request(
            "first_name and last_name are required",
        ));
    }

    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee create: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        "POST /employees".to_string(),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_CREATE,
        json!({ "request": request_json }),
    )
    .await
}

async fn update_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeUpdateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.update").await {
        return Err(AppError::forbidden(
            "You don't have permission to update employees",
        ));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee update: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("PATCH /employees/{id}"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_UPDATE,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn delete_employee(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.delete").await {
        return Err(AppError::forbidden(
            "You don't have permission to delete employees",
        ));
    }
    queue_employee_mutation(
        &state,
        &user.id,
        format!("DELETE /employees/{id}"),
        &headers,
        &json!({}),
        entity_creates::JOB_TYPE_EMPLOYEE_DELETE,
        json!({ "employee_id": id }),
    )
    .await
}

async fn upsert_employee_compensation(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeCompensationUpsertRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.compensation.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee compensation",
        ));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee compensation: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/compensation"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_COMPENSATION_UPSERT,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn assign_employee_asset(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeAssetAssignRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.assets.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee assets",
        ));
    }
    if body.asset_name.trim().is_empty() {
        return Err(AppError::bad_request("asset_name is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee asset: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/assets"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_ASSET_ASSIGN,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn upsert_employee_skill(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeSkillUpsertRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.skills.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee skills",
        ));
    }
    if body.skill_name.trim().is_empty() {
        return Err(AppError::bad_request("skill_name is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee skill: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/skills"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_SKILL_UPSERT,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn upsert_employee_certification(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeCertificationUpsertRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.skills.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee certifications",
        ));
    }
    if body.certification_name.trim().is_empty() {
        return Err(AppError::bad_request("certification_name is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee certification: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/certifications"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_CERTIFICATION_UPSERT,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn create_employee_performance_review(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeePerformanceReviewCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.performance.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee performance",
        ));
    }
    if body.cycle_name.trim().is_empty() {
        return Err(AppError::bad_request("cycle_name is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee performance review: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/performance-reviews"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_PERFORMANCE_REVIEW_CREATE,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

async fn create_employee_goal(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeGoalCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.performance.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee goals",
        ));
    }
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("title is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee goal: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/goals"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_GOAL_CREATE,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

// Human: Org chart returns all employees with their manager links for the frontend tree renderer.
// Agent: READS employees table; RETURNS id, name, employee_code, job_title, department, manager_employee_id, status; NO auth sub-queries.
async fn get_org_chart(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.view").await
        || check_permission(&state.pool, &user.id, "employees.view_all").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view employees"));
    }
    let rows = sqlx::query(
        r#"SELECT id, employee_code, first_name, last_name, display_name,
                  job_title, department, location, status::text, manager_employee_id
           FROM employees
           ORDER BY first_name, last_name"#,
    )
    .fetch_all(&state.pool)
    .await?;
    let nodes: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| json!({
            "id": r.get::<String, _>("id"),
            "employee_code": r.get::<String, _>("employee_code"),
            "first_name": r.get::<String, _>("first_name"),
            "last_name": r.get::<String, _>("last_name"),
            "display_name": r.get::<Option<String>, _>("display_name"),
            "job_title": r.get::<Option<String>, _>("job_title"),
            "department": r.get::<Option<String>, _>("department"),
            "location": r.get::<Option<String>, _>("location"),
            "status": r.get::<String, _>("status"),
            "manager_employee_id": r.get::<Option<String>, _>("manager_employee_id"),
        }))
        .collect();
    Ok(Json(json!({ "nodes": nodes })))
}

// Human: Lists all leave requests across all employees, filterable by status and leave type.
// Agent: READS employee_leave_requests JOIN employees; RETURNS paginated rows; REQUIRES leave.view permission.
async fn list_all_leave_requests(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.leave.view").await
        || check_permission(&state.pool, &user.id, "employees.leave.manage").await
        || check_permission(&state.pool, &user.id, "employees.leave.approve").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view leave requests"));
    }
    let status_filter = params.get("status").cloned().unwrap_or_default();
    let type_filter = params.get("leave_type").cloned().unwrap_or_default();
    let rows = sqlx::query(
        r#"SELECT lr.id, lr.employee_id, lr.leave_type::text, lr.start_date, lr.end_date,
                  lr.status::text, lr.reason, lr.rejection_reason, lr.approved_at,
                  lr.approved_by_user_id, lr.notes, lr.created_at, lr.updated_at,
                  e.first_name, e.last_name, e.display_name, e.employee_code,
                  e.department, e.job_title
           FROM employee_leave_requests lr
           JOIN employees e ON e.id = lr.employee_id
           WHERE ($1::text = '' OR lr.status::text = $1)
             AND ($2::text = '' OR lr.leave_type::text = $2)
           ORDER BY lr.created_at DESC
           LIMIT 500"#,
    )
    .bind(status_filter)
    .bind(type_filter)
    .fetch_all(&state.pool)
    .await?;
    let requests: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.get::<String, _>("id"),
        "employee_id": r.get::<String, _>("employee_id"),
        "employee_code": r.get::<String, _>("employee_code"),
        "employee_name": r.get::<Option<String>, _>("display_name")
            .unwrap_or_else(|| format!("{} {}", r.get::<String, _>("first_name"), r.get::<String, _>("last_name"))),
        "department": r.get::<Option<String>, _>("department"),
        "job_title": r.get::<Option<String>, _>("job_title"),
        "leave_type": r.get::<String, _>("leave_type"),
        "start_date": r.get::<chrono::NaiveDate, _>("start_date"),
        "end_date": r.get::<chrono::NaiveDate, _>("end_date"),
        "status": r.get::<String, _>("status"),
        "reason": r.get::<Option<String>, _>("reason"),
        "rejection_reason": r.get::<Option<String>, _>("rejection_reason"),
        "approved_at": r.get::<Option<chrono::NaiveDateTime>, _>("approved_at"),
        "approved_by_user_id": r.get::<Option<String>, _>("approved_by_user_id"),
        "notes": r.get::<Option<String>, _>("notes"),
        "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
        "updated_at": r.get::<chrono::NaiveDateTime, _>("updated_at"),
    })).collect();
    Ok(Json(json!({ "leave_requests": requests })))
}

// Human: Lists all employee documents across all employees for the company-wide documents view.
// Agent: READS employee_documents JOIN employees; REQUIRES documents.view permission; RETURNS rows with employee name.
async fn list_all_documents(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.documents.view").await
        || check_permission(&state.pool, &user.id, "employees.documents.manage").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view employee documents"));
    }
    let type_filter = params.get("doc_type").cloned().unwrap_or_default();
    let rows = sqlx::query(
        r#"SELECT d.id, d.employee_id, d.doc_type, d.title, d.description,
                  d.url, d.file_name, d.status::text, d.expires_at, d.created_at, d.updated_at,
                  e.first_name, e.last_name, e.display_name, e.employee_code
           FROM employee_documents d
           JOIN employees e ON e.id = d.employee_id
           WHERE d.status::text != 'ARCHIVED'
             AND ($1::text = '' OR d.doc_type = $1)
           ORDER BY d.created_at DESC
           LIMIT 500"#,
    )
    .bind(type_filter)
    .fetch_all(&state.pool)
    .await?;
    let docs: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.get::<String, _>("id"),
        "employee_id": r.get::<String, _>("employee_id"),
        "employee_code": r.get::<String, _>("employee_code"),
        "employee_name": r.get::<Option<String>, _>("display_name")
            .unwrap_or_else(|| format!("{} {}", r.get::<String, _>("first_name"), r.get::<String, _>("last_name"))),
        "doc_type": r.get::<String, _>("doc_type"),
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": r.get::<Option<String>, _>("url"),
        "file_name": r.get::<Option<String>, _>("file_name"),
        "status": r.get::<String, _>("status"),
        "expires_at": r.get::<Option<chrono::NaiveDate>, _>("expires_at"),
        "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
        "updated_at": r.get::<chrono::NaiveDateTime, _>("updated_at"),
    })).collect();
    Ok(Json(json!({ "documents": docs })))
}

// Human: Performance summary aggregates goal and review counts per employee for the company-wide view.
// Agent: READS employee_goals GROUP BY employee_id; READS employee_performance_reviews GROUP BY employee_id; JOINS employees.
async fn get_performance_summary(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.view").await
        || check_permission(&state.pool, &user.id, "employees.performance.manage").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view performance data"));
    }
    let rows = sqlx::query(
        r#"SELECT e.id, e.employee_code, e.first_name, e.last_name, e.display_name,
                  e.department, e.job_title, e.status::text,
                  COUNT(DISTINCT g.id) FILTER (WHERE g.status != 'COMPLETED' AND g.status != 'CANCELLED') AS active_goals,
                  COUNT(DISTINCT g.id) AS total_goals,
                  COUNT(DISTINCT pr.id) AS total_reviews,
                  MAX(pr.reviewed_at) AS last_reviewed_at
           FROM employees e
           LEFT JOIN employee_goals g ON g.employee_id = e.id
           LEFT JOIN employee_performance_reviews pr ON pr.employee_id = e.id
           GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.display_name,
                    e.department, e.job_title, e.status
           ORDER BY e.first_name, e.last_name"#,
    )
    .fetch_all(&state.pool)
    .await?;
    let summaries: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.get::<String, _>("id"),
        "employee_code": r.get::<String, _>("employee_code"),
        "display_name": r.get::<Option<String>, _>("display_name")
            .unwrap_or_else(|| format!("{} {}", r.get::<String, _>("first_name"), r.get::<String, _>("last_name"))),
        "department": r.get::<Option<String>, _>("department"),
        "job_title": r.get::<Option<String>, _>("job_title"),
        "status": r.get::<String, _>("status"),
        "active_goals": r.get::<Option<i64>, _>("active_goals").unwrap_or(0),
        "total_goals": r.get::<Option<i64>, _>("total_goals").unwrap_or(0),
        "total_reviews": r.get::<Option<i64>, _>("total_reviews").unwrap_or(0),
        "last_reviewed_at": r.get::<Option<chrono::NaiveDate>, _>("last_reviewed_at"),
    })).collect();
    Ok(Json(json!({ "summaries": summaries })))
}

// Human: Lists leave requests for a specific employee. Requires view permission.
// Agent: READS employee_leave_requests WHERE employee_id = $1; ORDERED BY created_at DESC.
async fn list_employee_leave(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.leave.view").await
        || check_permission(&state.pool, &user.id, "employees.leave.manage").await
        || check_permission(&state.pool, &user.id, "employees.leave.approve").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view leave requests"));
    }
    let rows = sqlx::query(
        r#"SELECT id, employee_id, leave_type::text, start_date, end_date,
                  status::text, reason, rejection_reason, approved_at, approved_by_user_id,
                  notes, metadata, created_at, updated_at
           FROM employee_leave_requests
           WHERE employee_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let requests: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.get::<String, _>("id"),
        "employee_id": r.get::<String, _>("employee_id"),
        "leave_type": r.get::<String, _>("leave_type"),
        "start_date": r.get::<chrono::NaiveDate, _>("start_date"),
        "end_date": r.get::<chrono::NaiveDate, _>("end_date"),
        "status": r.get::<String, _>("status"),
        "reason": r.get::<Option<String>, _>("reason"),
        "rejection_reason": r.get::<Option<String>, _>("rejection_reason"),
        "approved_at": r.get::<Option<chrono::NaiveDateTime>, _>("approved_at"),
        "approved_by_user_id": r.get::<Option<String>, _>("approved_by_user_id"),
        "notes": r.get::<Option<String>, _>("notes"),
        "metadata": r.get::<Option<serde_json::Value>, _>("metadata"),
        "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
        "updated_at": r.get::<chrono::NaiveDateTime, _>("updated_at"),
    })).collect();
    Ok(Json(json!({ "leave_requests": requests })))
}

// Human: Creates a leave request for an employee via background job queue.
// Agent: REQUIRES employees.leave.manage; ENQUEUES employee_leave_request_create job; RETURNS 202 + job_id.
async fn create_leave_request(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<LeaveRequestCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.leave.manage").await {
        return Err(AppError::forbidden("You don't have permission to create leave requests"));
    }
    if body.start_date.trim().is_empty() || body.end_date.trim().is_empty() || body.leave_type.trim().is_empty() {
        return Err(AppError::bad_request("leave_type, start_date and end_date are required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize leave request: {e}")))?;
    queue_employee_mutation(
        &state, &user.id,
        format!("POST /employees/{id}/leave"),
        &headers, &body,
        entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_CREATE,
        json!({ "employee_id": id, "request": request_json }),
    ).await
}

// Human: Updates (approve/deny/cancel) a leave request via background job.
// Agent: REQUIRES leave.approve for APPROVED/DENIED; leave.manage for CANCELLED; ENQUEUES update job.
async fn update_leave_request(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, leave_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<LeaveRequestUpdateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    let can_approve = check_permission(&state.pool, &user.id, "employees.leave.approve").await;
    let can_manage = check_permission(&state.pool, &user.id, "employees.leave.manage").await;
    if !can_approve && !can_manage {
        return Err(AppError::forbidden("You don't have permission to update leave requests"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize leave update: {e}")))?;
    queue_employee_mutation(
        &state, &user.id,
        format!("PATCH /employees/{id}/leave/{leave_id}"),
        &headers, &body,
        entity_creates::JOB_TYPE_EMPLOYEE_LEAVE_REQUEST_UPDATE,
        json!({ "employee_id": id, "leave_id": leave_id, "request": request_json }),
    ).await
}

// Human: Lists documents for a specific employee. Requires documents.view permission.
// Agent: READS employee_documents WHERE employee_id = $1; RETURNS rows ordered by created_at DESC.
async fn list_employee_documents(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.documents.view").await
        || check_permission(&state.pool, &user.id, "employees.documents.manage").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view employee documents"));
    }
    let rows = sqlx::query(
        r#"SELECT id, employee_id, doc_type, title, description, url, file_name,
                  status::text, expires_at, metadata, created_at, updated_at
           FROM employee_documents
           WHERE employee_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    let docs: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.get::<String, _>("id"),
        "employee_id": r.get::<String, _>("employee_id"),
        "doc_type": r.get::<String, _>("doc_type"),
        "title": r.get::<String, _>("title"),
        "description": r.get::<Option<String>, _>("description"),
        "url": r.get::<Option<String>, _>("url"),
        "file_name": r.get::<Option<String>, _>("file_name"),
        "status": r.get::<String, _>("status"),
        "expires_at": r.get::<Option<chrono::NaiveDate>, _>("expires_at"),
        "metadata": r.get::<Option<serde_json::Value>, _>("metadata"),
        "created_at": r.get::<chrono::NaiveDateTime, _>("created_at"),
        "updated_at": r.get::<chrono::NaiveDateTime, _>("updated_at"),
    })).collect();
    Ok(Json(json!({ "documents": docs })))
}

// Human: Creates a document record for an employee (URL-based, no binary upload).
// Agent: REQUIRES documents.manage; ENQUEUES employee_document_create job; RETURNS 202 + job_id.
async fn create_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<DocumentCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.documents.manage").await {
        return Err(AppError::forbidden("You don't have permission to manage employee documents"));
    }
    if body.title.trim().is_empty() {
        return Err(AppError::bad_request("title is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize document: {e}")))?;
    queue_employee_mutation(
        &state, &user.id,
        format!("POST /employees/{id}/documents"),
        &headers, &body,
        entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_CREATE,
        json!({ "employee_id": id, "request": request_json }),
    ).await
}

// Human: Deletes an employee document by ID via background job queue.
// Agent: REQUIRES documents.manage; ENQUEUES employee_document_delete job with doc_id; RETURNS 202 + job_id.
async fn delete_document(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, doc_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.documents.manage").await {
        return Err(AppError::forbidden("You don't have permission to manage employee documents"));
    }
    queue_employee_mutation(
        &state, &user.id,
        format!("DELETE /employees/{id}/documents/{doc_id}"),
        &headers, &json!({}),
        entity_creates::JOB_TYPE_EMPLOYEE_DOCUMENT_DELETE,
        json!({ "employee_id": id, "doc_id": doc_id }),
    ).await
}

async fn create_employee_lifecycle_event(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<EmployeeLifecycleEventCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.lifecycle.manage").await {
        return Err(AppError::forbidden(
            "You don't have permission to manage employee lifecycle",
        ));
    }
    if body.event_type.trim().is_empty() || body.title.trim().is_empty() {
        return Err(AppError::bad_request("event_type and title are required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize employee lifecycle event: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("POST /employees/{id}/lifecycle-events"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_EMPLOYEE_LIFECYCLE_EVENT_CREATE,
        json!({ "employee_id": id, "request": request_json }),
    )
    .await
}

// ─── Department handlers ───────────────────────────────────────────────────────

async fn list_departments(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.departments.view").await
        || check_permission(&state.pool, &user.id, "employees.departments.manage").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view departments"));
    }

    let rows = sqlx::query(
        r#"SELECT d.id, d.name, d.description, d.parent_department_id,
                  d.color, d.status, d.created_at, d.updated_at,
                  (SELECT COUNT(*) FROM employees e WHERE e.department = d.name) AS employee_count,
                  COALESCE(
                    array_agg(me.id) FILTER (WHERE me.id IS NOT NULL),
                    ARRAY[]::text[]
                  ) AS manager_employee_ids,
                  COALESCE(
                    array_agg(
                      me.employee_code || ' – ' ||
                      COALESCE(
                        NULLIF(me.display_name, ''),
                        NULLIF(TRIM(COALESCE(me.first_name, '') || ' ' || COALESCE(me.last_name, '')), ''),
                        me.employee_code
                      )
                    ) FILTER (WHERE me.id IS NOT NULL),
                    ARRAY[]::text[]
                  ) AS manager_labels
           FROM departments d
           LEFT JOIN department_managers dm ON dm.department_id = d.id
           LEFT JOIN employees me ON me.id = dm.manager_employee_id
           GROUP BY d.id, d.name, d.description, d.parent_department_id,
                    d.color, d.status, d.created_at, d.updated_at
           ORDER BY d.name ASC"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let departments: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let manager_employee_ids: Vec<String> = r.get("manager_employee_ids");
            let manager_labels: Vec<String> = r.get("manager_labels");
            let count: i64 = r.get("employee_count");
            json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "manager_employee_ids": manager_employee_ids,
                "manager_labels": manager_labels,
                "parent_department_id": r.get::<Option<String>, _>("parent_department_id"),
                "color": r.get::<Option<String>, _>("color"),
                "status": r.get::<String, _>("status"),
                "employee_count": count,
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })
        })
        .collect();

    Ok(Json(json!({ "departments": departments })))
}

async fn get_department(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(dept_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_employee_module(&state.pool).await?;
    let can_view = check_permission(&state.pool, &user.id, "employees.departments.view").await
        || check_permission(&state.pool, &user.id, "employees.departments.manage").await;
    if !can_view {
        return Err(AppError::forbidden("You don't have permission to view departments"));
    }

    let row = sqlx::query(
        r#"SELECT d.id, d.name, d.description, d.parent_department_id,
                  d.color, d.status, d.created_at, d.updated_at,
                  (SELECT COUNT(*) FROM employees e WHERE e.department = d.name) AS employee_count,
                  COALESCE(
                    array_agg(me.id) FILTER (WHERE me.id IS NOT NULL),
                    ARRAY[]::text[]
                  ) AS manager_employee_ids,
                  COALESCE(
                    array_agg(
                      me.employee_code || ' – ' ||
                      COALESCE(
                        NULLIF(me.display_name, ''),
                        NULLIF(TRIM(COALESCE(me.first_name, '') || ' ' || COALESCE(me.last_name, '')), ''),
                        me.employee_code
                      )
                    ) FILTER (WHERE me.id IS NOT NULL),
                    ARRAY[]::text[]
                  ) AS manager_labels
           FROM departments d
           LEFT JOIN department_managers dm ON dm.department_id = d.id
           LEFT JOIN employees me ON me.id = dm.manager_employee_id
           WHERE d.id = $1
           GROUP BY d.id, d.name, d.description, d.parent_department_id,
                    d.color, d.status, d.created_at, d.updated_at"#,
    )
    .bind(&dept_id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        None => Err(AppError::not_found("Department not found")),
        Some(r) => {
            let count: i64 = r.get("employee_count");
            let manager_employee_ids: Vec<String> = r.get("manager_employee_ids");
            let manager_labels: Vec<String> = r.get("manager_labels");
            Ok(Json(json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "description": r.get::<Option<String>, _>("description"),
                "manager_employee_ids": manager_employee_ids,
                "manager_labels": manager_labels,
                "parent_department_id": r.get::<Option<String>, _>("parent_department_id"),
                "color": r.get::<Option<String>, _>("color"),
                "status": r.get::<String, _>("status"),
                "employee_count": count,
                "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                "updated_at": r.get::<chrono::DateTime<chrono::Utc>, _>("updated_at"),
            })))
        }
    }
}

async fn create_department(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Json(body): Json<DepartmentCreateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.departments.manage").await {
        return Err(AppError::forbidden("You don't have permission to manage departments"));
    }
    if body.name.trim().is_empty() {
        return Err(AppError::bad_request("Department name is required"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize department: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        "POST /employees/departments".to_string(),
        &headers,
        &body,
        entity_creates::JOB_TYPE_DEPARTMENT_CREATE,
        json!({ "request": request_json }),
    )
    .await
}

async fn update_department(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(dept_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<DepartmentUpdateRequest>,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.departments.manage").await {
        return Err(AppError::forbidden("You don't have permission to manage departments"));
    }
    let request_json = serde_json::to_value(&body)
        .map_err(|e| AppError::internal(format!("serialize department update: {e}")))?;
    queue_employee_mutation(
        &state,
        &user.id,
        format!("PATCH /employees/departments/{dept_id}"),
        &headers,
        &body,
        entity_creates::JOB_TYPE_DEPARTMENT_UPDATE,
        json!({ "dept_id": dept_id, "request": request_json }),
    )
    .await
}

async fn delete_department(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(dept_id): Path<String>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    require_employee_module(&state.pool).await?;
    if !check_permission(&state.pool, &user.id, "employees.departments.manage").await {
        return Err(AppError::forbidden("You don't have permission to manage departments"));
    }
    queue_employee_mutation(
        &state,
        &user.id,
        format!("DELETE /employees/departments/{dept_id}"),
        &headers,
        &serde_json::Value::Null,
        entity_creates::JOB_TYPE_DEPARTMENT_DELETE,
        json!({ "dept_id": dept_id }),
    )
    .await
}
