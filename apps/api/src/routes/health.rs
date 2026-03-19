use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use std::time::Instant;
use sysinfo::{Disks, System};

const API_NAME: &str = "cloudwrkz-api";
const API_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Unversioned health routes mounted at /api/ (outside v1 prefix).
pub fn router(
    pool: PgPool,
    api_started_at: Instant,
    api_nodes_available: u32,
    api_region: Option<String>,
) -> Router {
    Router::new()
        .route("/api/health", get(health_check_legacy))
        .route("/api/ping", get(ping))
        .route("/api/ready", get(readiness))
        .with_state(HealthRouterState {
            pool,
            api_started_at,
            api_nodes_available,
            api_region,
        })
}

#[derive(Clone)]
struct HealthRouterState {
    pool: PgPool,
    api_started_at: Instant,
    api_nodes_available: u32,
    api_region: Option<String>,
}

/// Health routes available under the v1 prefix for web client convenience.
pub fn v1_router() -> Router<super::AppState> {
    Router::new()
        .route("/health", get(health_check_v1))
        .route("/ping", get(ping))
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
    pub api: ApiMeta,
    pub services: HealthServices,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<HostSnapshot>,
}

#[derive(Serialize)]
pub struct ApiMeta {
    pub name: String,
    pub version: String,
    pub environment: String,
    pub uptime_seconds: u64,
    /// Reported count of API nodes available for this deployment (single endpoint → 1 until multi-region).
    pub nodes_available: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
}

#[derive(Serialize)]
pub struct HealthServices {
    pub database: DatabaseHealth,
    pub process: ProcessHealth,
}

#[derive(Serialize)]
pub struct DatabaseHealth {
    pub status: String,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_time_ms: Option<u64>,
    pub pool_size: u32,
    pub pool_connections_idle: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct ProcessHealth {
    pub os: String,
    pub arch: String,
    pub pid: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_usage_percent: Option<f32>,
}

#[derive(Serialize)]
pub struct HostSnapshot {
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_available_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub load_average: Option<LoadAverageSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disks: Option<DiskAggregateSnapshot>,
}

#[derive(Serialize)]
pub struct LoadAverageSnapshot {
    pub one: f64,
    pub five: f64,
    pub fifteen: f64,
}

#[derive(Serialize)]
pub struct DiskAggregateSnapshot {
    pub total_bytes: u64,
    pub available_bytes: u64,
}

fn resolve_environment() -> String {
    std::env::var("APP_ENV")
        .or_else(|_| std::env::var("RUST_ENV"))
        .unwrap_or_else(|_| {
            if cfg!(debug_assertions) {
                "development".to_string()
            } else {
                "production".to_string()
            }
        })
}

fn resolve_hostname() -> Option<String> {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .filter(|s| !s.is_empty())
}

fn collect_host_blocking() -> Option<HostSnapshot> {
    let mut sys = System::new();
    sys.refresh_memory();
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let available_memory = sys.available_memory();
    let available_memory = if available_memory > 0 {
        Some(available_memory)
    } else {
        None
    };

    let load = System::load_average();
    let load_average = if load.one > f64::EPSILON
        || load.five > f64::EPSILON
        || load.fifteen > f64::EPSILON
    {
        Some(LoadAverageSnapshot {
            one: load.one,
            five: load.five,
            fifteen: load.fifteen,
        })
    } else {
        None
    };

    let disks = Disks::new_with_refreshed_list();
    let (disk_total, disk_avail) = disks.iter().fold((0u64, 0u64), |(t, a), d| {
        (t.saturating_add(d.total_space()), a.saturating_add(d.available_space()))
    });
    let disks = if disk_total > 0 {
        Some(DiskAggregateSnapshot {
            total_bytes: disk_total,
            available_bytes: disk_avail,
        })
    } else {
        None
    };

    let snapshot = HostSnapshot {
        memory_total_bytes: total_memory,
        memory_used_bytes: used_memory,
        memory_available_bytes: available_memory,
        load_average,
        disks,
    };

    if snapshot.memory_total_bytes == 0 && snapshot.disks.is_none() && snapshot.load_average.is_none()
    {
        None
    } else {
        Some(snapshot)
    }
}

async fn collect_host_snapshot() -> Option<HostSnapshot> {
    tokio::task::spawn_blocking(collect_host_blocking)
        .await
        .unwrap_or(None)
}

fn collect_process_cpu_blocking() -> Option<f32> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    let v = sys.global_cpu_usage();
    Some(v)
}

async fn collect_process_cpu() -> Option<f32> {
    tokio::task::spawn_blocking(collect_process_cpu_blocking)
        .await
        .unwrap_or(None)
}

async fn build_health_json(
    pool: &PgPool,
    api_started_at: Instant,
    nodes_available: u32,
    region: Option<String>,
) -> HealthResponse {
    let host_task = tokio::spawn(async move { collect_host_snapshot().await });
    let cpu_task = tokio::spawn(async move { collect_process_cpu().await });

    let start = std::time::Instant::now();
    let db_result = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await;
    let db_elapsed_ms = start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

    let pool_size = pool.size();
    let pool_connections_idle = pool.num_idle();

    let (db_status, connected, error) = match db_result {
        Ok(_) => ("healthy".to_string(), true, None),
        Err(e) => ("unhealthy".to_string(), false, Some(format!("{e}"))),
    };

    let overall = if connected {
        "healthy".to_string()
    } else {
        "unhealthy".to_string()
    };

    let host = host_task.await.ok().flatten();
    let cpu_usage_percent = cpu_task.await.ok().flatten();

    HealthResponse {
        status: overall,
        timestamp: chrono::Utc::now().to_rfc3339(),
        api: ApiMeta {
            name: API_NAME.to_string(),
            version: API_VERSION.to_string(),
            environment: resolve_environment(),
            uptime_seconds: api_started_at.elapsed().as_secs(),
            nodes_available: nodes_available.max(1),
            region,
            hostname: resolve_hostname(),
        },
        services: HealthServices {
            database: DatabaseHealth {
                status: db_status,
                connected,
                response_time_ms: if connected {
                    Some(db_elapsed_ms)
                } else {
                    None
                },
                pool_size,
                pool_connections_idle,
                error,
            },
            process: ProcessHealth {
                os: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                pid: std::process::id(),
                cpu_usage_percent,
            },
        },
        host,
    }
}

async fn respond_health(
    pool: &PgPool,
    api_started_at: Instant,
    nodes_available: u32,
    region: Option<String>,
) -> (StatusCode, Json<HealthResponse>) {
    let body = build_health_json(pool, api_started_at, nodes_available, region).await;
    let status_code = if body.services.database.connected {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status_code, Json(body))
}

async fn health_check_legacy(State(state): State<HealthRouterState>) -> impl IntoResponse {
    respond_health(
        &state.pool,
        state.api_started_at,
        state.api_nodes_available,
        state.api_region.clone(),
    )
    .await
}

async fn health_check_v1(State(state): State<super::AppState>) -> impl IntoResponse {
    respond_health(
        &state.pool,
        state.api_started_at,
        state.config.api_nodes_available,
        state.config.api_region.clone(),
    )
    .await
}

async fn ping() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

async fn readiness(State(state): State<HealthRouterState>) -> impl IntoResponse {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "ready": true }))),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "ready": false })),
        ),
    }
}
