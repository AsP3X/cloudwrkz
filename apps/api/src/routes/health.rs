use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;

/// Unversioned health routes mounted at /api/ (outside v1 prefix).
pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/api/health", get(health_check))
        .route("/api/ping", get(ping))
        .route("/api/ready", get(readiness))
        .with_state(pool)
}

/// Health routes available under the v1 prefix for web client convenience.
pub fn v1_router() -> Router<super::AppState> {
    Router::new()
        .route("/health", get(health_check_from_state))
        .route("/ping", get(ping))
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    timestamp: String,
    services: HealthServices,
}

#[derive(Serialize)]
struct HealthServices {
    database: DatabaseHealth,
}

#[derive(Serialize)]
struct DatabaseHealth {
    status: String,
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn health_check(State(pool): State<PgPool>) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let db_result = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&pool)
        .await;
    let elapsed = start.elapsed();

    let (db_status, connected, error) = match db_result {
        Ok(_) => ("healthy".to_string(), true, None),
        Err(e) => ("unhealthy".to_string(), false, Some(format!("{e}"))),
    };

    let overall = if connected { "healthy" } else { "unhealthy" };
    let status_code = if connected {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(HealthResponse {
            status: overall.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            services: HealthServices {
                database: DatabaseHealth {
                    status: db_status,
                    connected,
                    response_time: Some(format!("{}ms", elapsed.as_millis())),
                    error,
                },
            },
        }),
    )
}

async fn ping() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn readiness(State(pool): State<PgPool>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&pool).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ready": true }))),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "ready": false })),
        ),
    }
}

async fn health_check_from_state(
    State(state): State<super::AppState>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let db_result = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await;
    let elapsed = start.elapsed();

    let (db_status, connected, error) = match db_result {
        Ok(_) => ("healthy".to_string(), true, None),
        Err(e) => ("unhealthy".to_string(), false, Some(format!("{e}"))),
    };

    let overall = if connected { "healthy" } else { "unhealthy" };
    let status_code = if connected {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        Json(HealthResponse {
            status: overall.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            services: HealthServices {
                database: DatabaseHealth {
                    status: db_status,
                    connected,
                    response_time: Some(format!("{}ms", elapsed.as_millis())),
                    error,
                },
            },
        }),
    )
}
