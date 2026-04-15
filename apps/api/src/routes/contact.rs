use axum::{Json, Router, routing::post};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use crate::error::AppError;
use crate::routes::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/contact", post(contact_form))
}

#[derive(Deserialize)]
struct ContactRequest {
    name: String,
    email: String,
    subject: String,
    message: String,
}

static RATE_LIMIT: std::sync::LazyLock<Mutex<HashMap<String, (u32, Instant)>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

async fn contact_form(
    Json(body): Json<ContactRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if body.name.len() < 2 {
        return Err(AppError::bad_request("Name must be at least 2 characters"));
    }
    if !body.email.contains('@') {
        return Err(AppError::bad_request("Invalid email address"));
    }
    if body.subject.len() < 3 {
        return Err(AppError::bad_request(
            "Subject must be at least 3 characters",
        ));
    }
    if body.message.len() < 10 {
        return Err(AppError::bad_request(
            "Message must be at least 10 characters",
        ));
    }

    {
        let mut map = RATE_LIMIT.lock().unwrap();
        let now = Instant::now();
        let entry = map.entry("global".to_string()).or_insert((0, now));
        if now.duration_since(entry.1).as_secs() > 3600 {
            *entry = (0, now);
        }
        if entry.0 >= 20 {
            return Err(AppError::too_many_requests(
                "Too many requests. Please try again later.",
            ));
        }
        entry.0 += 1;
    }

    tracing::info!(
        event = "contact.submit",
        name = body.name,
        email = body.email,
        subject = body.subject,
        "Contact form submission"
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Thank you for your message! We'll get back to you soon."
    })))
}
