//! Optional customer ↔ time-tracking billing: resolve hourly rates and validate cross-module links.

// Human: Time entries store a snapshot hourly rate and optional billing contact for per-contact employee overrides.
// Agent: resolve_time_entry_billing READS customers/contacts/employees; WRITES customer_id+customer_contact_id+hourly_rate; REQUIRES ACTIVE non-archived customer.

use sqlx::{PgPool, Row};

use crate::error::AppError;

/// Billing fields accepted on time entry create/update payloads.
#[derive(Debug, Clone, Default)]
pub struct TimeEntryBillingInput {
    pub customer_id: Option<String>,
    pub customer_contact_id: Option<String>,
    pub hourly_rate: Option<f64>,
}

/// Resolved billing columns ready to persist on `time_entries`.
#[derive(Debug, Clone)]
pub struct ResolvedTimeEntryBilling {
    pub customer_id: Option<String>,
    pub customer_contact_id: Option<String>,
    pub hourly_rate: Option<f64>,
}

/// Whether the customers module is enabled in `modules`.
pub async fn customers_module_enabled(pool: &PgPool) -> bool {
    sqlx::query_scalar("SELECT enabled FROM modules WHERE key = 'customers'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

fn validate_hourly_rate(rate: f64) -> Result<(), AppError> {
    if rate.is_nan() || rate.is_infinite() || rate < 0.0 {
        return Err(AppError::bad_request("hourly_rate must be a non-negative number"));
    }
    Ok(())
}

/// Resolve employee-specific rate for the timer owner using an explicit or primary contact.
async fn resolve_customer_hourly_rate(
    pool: &PgPool,
    user_id: &str,
    customer_id: &str,
    customer_contact_id: Option<&str>,
) -> Result<Option<f64>, AppError> {
    let row = sqlx::query(
        r#"SELECT default_hourly_rate::float8 AS default_hourly_rate
           FROM customers
           WHERE id = $1 AND archived_at IS NULL AND status::text = 'ACTIVE'"#,
    )
    .bind(customer_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Customer not found"))?;

    let default_rate: Option<f64> = row.get("default_hourly_rate");

    let contact_id: Option<String> = if let Some(cid) = customer_contact_id.map(str::trim).filter(|s| !s.is_empty()) {
        let ok: Option<String> = sqlx::query_scalar(
            "SELECT id FROM customer_contacts WHERE id = $1 AND customer_id = $2",
        )
        .bind(cid)
        .bind(customer_id)
        .fetch_optional(pool)
        .await?;
        if ok.is_none() {
            return Err(AppError::not_found("Customer contact not found"));
        }
        Some(cid.to_string())
    } else {
        sqlx::query_scalar(
            r#"SELECT id FROM customer_contacts
               WHERE customer_id = $1
               ORDER BY is_primary DESC, created_at ASC
               LIMIT 1"#,
        )
        .bind(customer_id)
        .fetch_optional(pool)
        .await?
    };

    let employee_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM employees WHERE linked_user_id = $1 LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let (Some(emp_id), Some(cid)) = (employee_id, contact_id) {
        let employee_rate: Option<f64> = sqlx::query_scalar(
            r#"SELECT hourly_rate::float8
               FROM customer_contact_employee_rates
               WHERE customer_contact_id = $1 AND employee_id = $2"#,
        )
        .bind(&cid)
        .bind(&emp_id)
        .fetch_optional(pool)
        .await?;

        if let Some(rate) = employee_rate {
            return Ok(Some(rate));
        }
    }

    Ok(default_rate)
}

/// Validate and resolve billing fields for a new or updated time entry.
pub async fn resolve_time_entry_billing(
    pool: &PgPool,
    user_id: &str,
    input: TimeEntryBillingInput,
) -> Result<ResolvedTimeEntryBilling, AppError> {
    let customers_on = customers_module_enabled(pool).await;

    if (input.customer_id.is_some() || input.customer_contact_id.is_some()) && !customers_on {
        return Err(AppError::bad_request(
            "Customer linking is unavailable while the Customers module is disabled",
        ));
    }

    if let Some(rate) = input.hourly_rate {
        validate_hourly_rate(rate)?;
    }

    let customer_id = match input.customer_id.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(id) => Some(id.to_string()),
    };

    let customer_contact_id = match input.customer_contact_id.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(id) => Some(id.to_string()),
    };

    if customer_contact_id.is_some() && customer_id.is_none() {
        return Err(AppError::bad_request(
            "customer_contact_id requires customer_id",
        ));
    }

    if let Some(ref cid) = customer_id {
        let exists: Option<String> = sqlx::query_scalar(
            r#"SELECT id FROM customers
               WHERE id = $1 AND archived_at IS NULL AND status::text = 'ACTIVE'"#,
        )
        .bind(cid)
        .fetch_optional(pool)
        .await?;
        if exists.is_none() {
            return Err(AppError::not_found("Customer not found or inactive"));
        }
    }

    let resolved_contact = if customer_id.is_some() {
        if let Some(ref ccid) = customer_contact_id {
            let ok: Option<String> = sqlx::query_scalar(
                "SELECT id FROM customer_contacts WHERE id = $1 AND customer_id = $2",
            )
            .bind(ccid)
            .bind(customer_id.as_ref().unwrap())
            .fetch_optional(pool)
            .await?;
            if ok.is_none() {
                return Err(AppError::not_found("Customer contact not found"));
            }
            Some(ccid.clone())
        } else {
            None
        }
    } else {
        None
    };

    let hourly_rate = if let Some(rate) = input.hourly_rate {
        Some(rate)
    } else if let Some(ref cid) = customer_id {
        resolve_customer_hourly_rate(
            pool,
            user_id,
            cid,
            resolved_contact.as_deref(),
        )
        .await?
    } else {
        None
    };

    Ok(ResolvedTimeEntryBilling {
        customer_id,
        customer_contact_id: resolved_contact,
        hourly_rate,
    })
}

/// Minimal customer summary embedded on time entry API responses.
pub async fn customer_summary_json(
    pool: &PgPool,
    customer_id: &str,
) -> Result<serde_json::Value, AppError> {
    let row = sqlx::query(
        r#"SELECT id, customer_number, customer_type::text AS customer_type,
                  first_name, last_name, company_name
           FROM customers
           WHERE id = $1"#,
    )
    .bind(customer_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Customer not found"))?;

    let customer_type: String = row.get("customer_type");
    let display_name = if customer_type == "COMPANY" {
        row.get::<Option<String>, _>("company_name")
            .unwrap_or_else(|| "Company".to_string())
    } else {
        format!(
            "{} {}",
            row.get::<Option<String>, _>("first_name")
                .unwrap_or_default(),
            row.get::<Option<String>, _>("last_name")
                .unwrap_or_default()
        )
        .trim()
        .to_string()
    };

    Ok(serde_json::json!({
        "id": row.get::<String, _>("id"),
        "customer_number": row.get::<String, _>("customer_number"),
        "display_name": display_name,
    }))
}
