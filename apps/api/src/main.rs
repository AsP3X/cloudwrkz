mod audit;
mod auth;
mod config;
mod db;
mod diagnostics_token;
mod error;
mod id;
mod models;
mod routes;

use axum::body::Body;
use axum::http::Method;
use axum::Router;
use std::sync::OnceLock;
use std::time::Duration;
use std::net::SocketAddr;
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};
use tower_http::trace::{TraceLayer, OnResponse};
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::EnvFilter;

use config::{parse_deployment_cli_from_args, AppConfig};

/// Controls how much is logged: `debug` = all available info, `prod` = only required fields.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LogVerbosity {
    Debug,
    Prod,
}

static LOG_VERBOSITY: OnceLock<LogVerbosity> = OnceLock::new();

fn log_verbosity() -> LogVerbosity {
    *LOG_VERBOSITY.get().unwrap_or(&LogVerbosity::Prod)
}

const HELP: &str = r#"CloudWrkz API server.

Usage: cloudwrkz-api [OPTIONS]
       cloudwrkz-api diagnostics-token generate

Options:
  -v, --verbose [LEVEL]   Log verbosity: no value or "debug" = full (client_ip, user_agent, etc.); "prod" = minimal (default when -v not set)
  -h, --help              Print this help and exit
      --region <ID>       Deployment region for /health (overrides API_REGION)
      --api-nodes <N>     Reported API node count for /health (overrides API_NODES_AVAILABLE; default 1)

Commands:
  diagnostics-token generate   Generate a diagnostics API token (stores hash in DB), print token once.
                               Requires DATABASE_URL; runs migrations. Use with GET /api/v1/health/detailed.

Environment: LOG_VERBOSITY (debug|prod), LOG_FORMAT (json), RUST_LOG, DATABASE_URL,
             API_REGION, API_NODES_AVAILABLE, DIAGNOSTICS_HEALTH_TOKEN (optional plaintext override for detailed health),
             DATABASE_POOL_ACQUIRE_TIMEOUT_SECS, DATABASE_POOL_MAX_CONNECTIONS,
             DATABASE_MIGRATE_RETRY_MAX_SECS, etc.
"#;

/// Parse `-v` / `-v debug` / `-v prod` and `-h` from env::args(). CLI overrides LOG_VERBOSITY env.
fn parse_verbosity_from_args() -> Option<LogVerbosity> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "-v" || arg == "--verbose" {
            match args.next().as_deref() {
                Some("prod") => return Some(LogVerbosity::Prod),
                Some("debug") | None => return Some(LogVerbosity::Debug),
                _ => return Some(LogVerbosity::Debug),
            }
        }
    }
    None
}

/// Logs each HTTP response; fields depend on LOG_VERBOSITY (prod: status, latency_ms; debug: + content_length).
#[derive(Clone)]
struct ApiOnResponse;

impl<B> OnResponse<B> for ApiOnResponse {
    fn on_response(
        self,
        response: &axum::http::Response<B>,
        latency: Duration,
        _span: &tracing::Span,
    ) {
        let status = response.status().as_u16();
        let latency_ms = latency.as_millis().min(u64::MAX as u128) as u64;
        match log_verbosity() {
            LogVerbosity::Debug => {
                let content_length = response
                    .headers()
                    .get(axum::http::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("-");
                tracing::info!(
                    status,
                    latency_ms,
                    content_length,
                    "request completed"
                );
            }
            LogVerbosity::Prod => {
                tracing::info!(
                    status,
                    latency_ms,
                    "request completed"
                );
            }
        }
    }
}

fn init_logging() {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let use_json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    // UTC ISO8601/RFC3339 timestamps for log aggregators
    let timer = UtcTime::rfc_3339();
    let fmt = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .with_timer(timer);
    if use_json {
        // Structured JSON: one object per line (NDJSON), flat fields for analysis tools
        fmt.json()
            .with_current_span(true)
            .with_span_list(false)
            .flatten_event(true)
            .init();
    } else {
        fmt.init();
    }
}

/// Builds a span for each HTTP request. Prod: request_id, method, uri (path). Debug: + client_ip, path_and_query, user_agent.
fn make_request_span(request: &axum::http::Request<Body>) -> tracing::Span {
    let request_id = request
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let path = request.uri().path();
    let path_and_query = request
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or(path);
    let client_ip = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .or_else(|| {
            request
                .headers()
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
        })
        .unwrap_or("unknown");
    let user_agent = request
        .headers()
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("-");
    match log_verbosity() {
        LogVerbosity::Debug => tracing::info_span!(
            "request",
            request_id = %request_id,
            method = %request.method(),
            uri = %path_and_query,
            client_ip = %client_ip,
            user_agent = %user_agent,
        ),
        LogVerbosity::Prod => tracing::info_span!(
            "request",
            request_id = %request_id,
            method = %request.method(),
            uri = %path,
        ),
    }
}

#[tokio::main]
async fn main() {
    // Handle -h/--help before loading env/config
    for arg in std::env::args().skip(1) {
        if arg == "-h" || arg == "--help" {
            eprintln!("{HELP}");
            std::process::exit(0);
        }
    }

    dotenvy::dotenv().ok();
    // When run from repo root, CWD has no .env; try apps/api/.env and repo root .env relative to executable
    if std::env::var("DATABASE_URL").is_err() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                for path in [
                    exe_dir.join("..").join("..").join("apps").join("api").join(".env"),
                    exe_dir.join("..").join("..").join(".env"),
                ] {
                    let path = path.canonicalize().unwrap_or(path);
                    if path.exists() {
                        let _ = dotenvy::from_path(&path);
                        if std::env::var("DATABASE_URL").is_ok() {
                            break;
                        }
                    }
                }
            }
        }
    }

    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 3 && args[1] == "diagnostics-token" && args[2] == "generate" {
        let db_url = match std::env::var("DATABASE_URL") {
            Ok(u) => u,
            Err(_) => {
                eprintln!("DATABASE_URL must be set for diagnostics-token generate");
                std::process::exit(1);
            }
        };
        diagnostics_token::cli_generate(&db_url).await;
        return;
    }

    // Set before init_logging so request/response logging uses it. CLI -v / -v debug overrides env.
    LOG_VERBOSITY.get_or_init(|| {
        parse_verbosity_from_args().unwrap_or_else(|| {
            match std::env::var("LOG_VERBOSITY").as_deref() {
                Ok("debug") => LogVerbosity::Debug,
                _ => LogVerbosity::Prod,
            }
        })
    });

    init_logging();

    let mut config = AppConfig::from_env();
    config.apply_deployment_cli(parse_deployment_cli_from_args());
    tracing::info!(
        event = "startup",
        bind_addr = %config.bind_addr(),
        log_verbosity = ?log_verbosity(),
        api_region = ?config.api_region,
        api_nodes_available = config.api_nodes_available,
        "Starting CloudWrkz API"
    );
    if log_verbosity() == LogVerbosity::Debug {
        tracing::debug!(
            event = "config",
            cookie_domain = ?config.cookie_domain(),
            cookie_secure = config.cookie_secure(),
            "cookie settings"
        );
    }

    let pool = db::create_pool_lazy(&config.database_url)
        .expect("Invalid DATABASE_URL (cannot parse connection string)");

    // Migrations run in the background so the HTTP listener starts immediately.
    // Auth endpoints return 202 and retry DB access internally; health endpoints
    // gracefully report DB status — so the server is usable before migrations finish.
    {
        let pool = pool.clone();
        tokio::spawn(async move {
            db::run_migrations_with_transient_retries(&pool).await;
        });
    }

    let cors = build_cors(&config);

    let api_started_at = std::time::Instant::now();
    let v1 = routes::v1_router(pool.clone(), config.clone(), api_started_at);

    let app = Router::new()
        .nest("/api/v1", v1)
        .merge(routes::health::router(
            pool.clone(),
            api_started_at,
            config.api_nodes_available,
            config.api_region.clone(),
            config.diagnostics_health_token.clone(),
        ))
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(make_request_span)
                .on_response(ApiOnResponse),
        )
        .layer(tower_http::limit::RequestBodyLimitLayer::new(
            config.max_body_size,
        ));

    let addr: SocketAddr = config.bind_addr().parse().expect("Invalid bind address");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    tracing::info!(event = "listen", addr = %addr, "Listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");
}

fn build_cors(config: &AppConfig) -> CorsLayer {
    // When allow_credentials is true, CORS forbids * for headers and methods; use explicit/mirror.
    let (methods, headers) = if config.cors_origins.is_empty() {
        (AllowMethods::any(), AllowHeaders::any())
    } else {
        (
            AllowMethods::list([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ]),
            AllowHeaders::mirror_request(),
        )
    };

    let mut cors = CorsLayer::new()
        .allow_methods(methods)
        .allow_headers(headers);

    if config.cors_origins.is_empty() {
        cors = cors
            .allow_origin(tower_http::cors::Any)
            .allow_credentials(false);
    } else {
        let origins: Vec<_> = config
            .cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        cors = cors.allow_origin(origins).allow_credentials(true);
    }

    cors
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { tracing::info!(event = "shutdown", signal = "SIGINT", "Shutting down"); },
        _ = terminate => { tracing::info!(event = "shutdown", signal = "SIGTERM", "Shutting down"); },
    }
}
