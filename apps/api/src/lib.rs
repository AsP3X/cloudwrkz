//! CloudWrkz HTTP API — shared by the `cloudwrkz-api` binary and integration tests.

// Human: This crate wires Axum, tracing, CORS, migrations, and the background job supervisor into one process entrypoint used by binaries and tests.
// Agent: EXPORTS run/build_http_app/AppConfig/AppState/job supervisor helpers; COMPOSES nested /api/v1 + legacy health + QR public routes + middleware stack.

mod audit;
pub mod auth;
mod auth_governor;
mod command_queue;
mod config;
pub mod db;
mod diagnostics_token;
mod error;
mod github_metadata;
mod github_rate_limit;
pub mod id;
pub mod job_queue;
mod link_preview;
mod models;
pub mod permissions;
mod request_tracking;
pub mod routes;
mod time_entry_billing;

pub use config::AppConfig;
pub use job_queue::supervisor::{
    JOB_QUEUE_WORKER_MAX, JOB_QUEUE_WORKER_MIN, JobWorkerSupervisor,
    SYSTEM_SETTING_JOB_QUEUE_WORKER_COUNT, WorkerListEntry, WorkerLogRegistry,
    persist_worker_count, resolve_initial_worker_count, spawn_job_queue_supervisor,
    worker_hostname,
};
pub use routes::AppState;
pub use routes::mutation_broker_for_config;

/// Start the PostgreSQL-backed job worker pool (same as `run()` after migrations). For integration tests.
// Human: Integration tests need the same dispatcher pool as production without starting the full HTTP listener stack.
// Agent: DELEGATES to job_queue::spawn_job_queue_worker(pool, config, mutation_broker); RETURNS Arc<JobWorkerSupervisor>.

pub fn spawn_background_job_worker(
    pool: sqlx::PgPool,
    config: AppConfig,
    mutation_broker: command_queue::MutationBroker,
) -> std::sync::Arc<JobWorkerSupervisor> {
    job_queue::spawn_job_queue_worker(pool, config, mutation_broker)
}

use axum::Router;
use axum::body::Body;
use axum::http::Method;
use axum::http::header::{self, HeaderName, HeaderValue};
use axum::middleware;
use std::net::SocketAddr;
use std::sync::OnceLock;
use std::time::Duration;
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::{OnResponse, TraceLayer};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::time::UtcTime;

use config::parse_deployment_cli_from_args;

/// Controls how much is logged: `debug` = all available info, `prod` = only required fields.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LogVerbosity {
    Debug,
    Prod,
}

static LOG_VERBOSITY: OnceLock<LogVerbosity> = OnceLock::new();

// Human: After `run()` initializes the `OnceLock`, every middleware log line reads the same enum without re-parsing environment strings.
// Agent: READS LOG_VERBOSITY.get(); FALLBACK LogVerbosity::Prod when run() has not initialized yet (should be rare).

fn log_verbosity() -> LogVerbosity {
    *LOG_VERBOSITY.get().unwrap_or(&LogVerbosity::Prod)
}

pub const HELP: &str = r#"CloudWrkz API server.

Usage: cloudwrkz-api [OPTIONS]
       cloudwrkz-api diagnostics-token generate
       cloudwrkz-api migrate-repair

Options:
  -v, --verbose [LEVEL]   Log verbosity: no value or "debug" = full (client_ip, user_agent, etc.); "prod" = minimal (default when -v not set)
  -h, --help              Print this help and exit
      --region <ID>       Deployment region for /health (overrides API_REGION)
      --api-nodes <N>     Reported API node count for /health (overrides API_NODES_AVAILABLE; default 1)

Commands:
  diagnostics-token generate   Generate a diagnostics API token (stores hash in DB), print token once.
                               Requires DATABASE_URL; runs migrations. Use with GET /api/v1/health/detailed.

  migrate-repair               Fix sqlx checksum drift in `_sqlx_migrations` after editing migration files
                               in dev (same as `sqlx migrate repair`). Requires DATABASE_URL; does not re-run SQL.
                               Disabled when CLOUDWRKZ_DEPLOYMENT=production.

Environment: LOG_VERBOSITY (debug|prod), LOG_FORMAT (json), RUST_LOG, DATABASE_URL,
             With LOG_VERBOSITY=debug the default filter includes jobs=debug (dispatcher + per-job tracing on target `jobs`).
             With LOG_VERBOSITY=prod you can still set RUST_LOG=info,jobs=debug to log only the background job queue.
             API_REGION, API_NODES_AVAILABLE, DIAGNOSTICS_HEALTH_TOKEN (optional plaintext override for detailed health),
             AUTH_RATE_LIMIT_PER_MINUTE, AUTH_RATE_LIMIT_BURST,
             COMMAND_DB_TX_MAX_MS, COMMAND_DB_LOCK_TIMEOUT_MS, COMMAND_DB_STATEMENT_TIMEOUT_MS,
             MUTATION_QUEUE_CAPACITY, IDEMPOTENCY_MAX_ENTRIES, IDEMPOTENCY_TTL_SECS,
             (HTTP 202 + GET /api/v1/mutation-jobs/{job_id}: transient DB retries, and async creates for tickets/todos/time entries/links via background_jobs.)
             DATABASE_POOL_ACQUIRE_TIMEOUT_SECS, DATABASE_POOL_MAX_CONNECTIONS,
             DATABASE_MIGRATE_RETRY_MAX_SECS, HTTP_REQUEST_LOG_ENABLED (true|false, default true), etc.
             GITHUB_TOKEN or GITHUB_API_TOKEN (optional): authenticated GitHub REST (higher rate limits; no in-process hourly cap).
             GITHUB_ANONYMOUS_MAX_REQUESTS_PER_HOUR (default 60): rolling-hour cap on GitHub REST GETs for this process when no token is set (GitHub allows 60/hour per IP unauthenticated). Jobs may wait inside a run until slots free; no fixed spacing between requests.
             GitHub metadata jobs: dispatcher polls ~400ms and runs jobs concurrently up to JOB_QUEUE_GITHUB_MAX_CONCURRENT.
             JOB_QUEUE_GITHUB_MAX_CONCURRENT (default 1): max concurrent github_link_metadata jobs.
             JOB_QUEUE_GITHUB_MIN_START_INTERVAL_SECS: optional pacing between job starts (per job type policy; not used for github_link_metadata today).
             JOB_QUEUE_WORKER_COUNT (default 1, max 32): number of background job dispatcher loops in this process (shared per-type budgets; DB `system_settings.job_queue_worker_count` overrides after migrations).
"#;

/// Parse `-v` / `-v debug` / `-v prod` and `-h` from env::args(). CLI overrides LOG_VERBOSITY env.
// Human: Developers pass `-v` on the command line to temporarily widen HTTP span fields without editing `.env` files.
// Agent: SCANS std::env::args after argv0; MATCHES -v/--verbose optional next token prod|debug; RETURNS Some(LogVerbosity).

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
    // Human: Prod logs stay minimal for cost; debug adds content-length so oversized responses are obvious during profiling.
    // Agent: READS log_verbosity(); EMITS tracing::info with status+latency_ms; OPTIONAL content_length header lookup.

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
                tracing::info!(status, latency_ms, content_length, "request completed");
            }
            LogVerbosity::Prod => {
                tracing::info!(status, latency_ms, "request completed");
            }
        }
    }
}

// Human: Operators choose JSON vs pretty text via `LOG_FORMAT`, and RUST_LOG still overrides the default filter when set.
// Agent: READS LOG_FORMAT json; BUILDS EnvFilter from env or default info,jobs=debug; INITIALIZES tracing_subscriber fmt layer once.

fn init_logging() {
    let default_directive = match log_verbosity() {
        LogVerbosity::Debug => "info,jobs=debug",
        LogVerbosity::Prod => "info",
    };
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default_directive));
    let use_json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    let timer = UtcTime::rfc_3339();
    let fmt = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .with_timer(timer);
    if use_json {
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
// Human: Request ids propagate from `X-Request-Id` so upstream gateways and this API’s logs agree on correlation keys.
// Agent: CALLS request_id_from_headers; READS URI path vs path_and_query; EXTRACTS x-forwarded-for first hop or x-real-ip; BRANCHES span fields by verbosity.

fn make_request_span(request: &axum::http::Request<Body>) -> tracing::Span {
    let request_id = crate::audit::request_id_from_headers(request.headers());
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

// Human: Empty `CORS_ORIGINS` means “allow any origin without credentials” for quick local dev; non-empty lists enable credentialed browser calls.
// Agent: IF cors_origins empty USE Any origin no credentials; ELSE PARSE list AllowOrigin exact origins + allow_credentials true + method/header allowlists.

fn build_cors(config: &AppConfig) -> CorsLayer {
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

/// Full HTTP stack (v1 + legacy health, security headers, CORS, trace, body limit) — used in production and tests.
// Human: Layers apply outer-to-inner as Axum merges routers: security headers, CORS, trace, body cap, then async request logging middleware.
// Agent: MERGES health + nest /api/v1 v1_router + public QR nest; WITH_STATE AppState; LAYERS SetResponseHeader, Cors, TraceLayer, RequestBodyLimit, request_tracking.

pub fn build_http_app(state: AppState) -> Router {
    let cors = build_cors(&state.config);
    let max_body = state.config.max_body_size;
    let request_tracking_state = state.clone();
    Router::new()
        .merge(routes::health::router())
        .nest("/api/v1", routes::v1_router(&state.config))
        .nest(
            "/api/auth/qr-login",
            routes::auth_qr_login::scoped_router()
                .layer(crate::auth_governor::auth_rate_limit_layer(&state.config)),
        )
        .with_state(state)
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::REFERRER_POLICY,
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static(
                "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
            ),
        ))
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(make_request_span)
                .on_response(ApiOnResponse),
        )
        .layer(tower_http::limit::RequestBodyLimitLayer::new(max_body))
        .layer(middleware::from_fn_with_state(
            request_tracking_state,
            request_tracking::middleware,
        ))
}

// Human: Graceful shutdown waits for Ctrl+C on all platforms and SIGTERM on Unix so orchestrators can drain connections cleanly.
// Agent: tokio::select ctrl_c vs unix terminate OR pending on non-Unix; LOGS shutdown event with signal name.

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

/// Server entry: load env, migrations, bind, serve. Used by `cloudwrkz-api` binary.
// Human: Startup loads `.env` from common paths, applies migrations with retries, boots job dispatchers, then binds TCP and serves with connect info for rate limits.
// Agent: PARSES CLI help; dotenv DATABASE_URL hunt; init_logging; AppConfig::from_env + CLI overrides; create_pool_lazy; run_migrations; spawn_job_queue_supervisor; axum::serve with graceful_shutdown.

pub async fn run() {
    for arg in std::env::args().skip(1) {
        if arg == "-h" || arg == "--help" {
            eprintln!("{HELP}");
            std::process::exit(0);
        }
    }

    dotenvy::dotenv().ok();
    if std::env::var("DATABASE_URL").is_err() {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                for path in [
                    exe_dir
                        .join("..")
                        .join("..")
                        .join("apps")
                        .join("api")
                        .join(".env"),
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

    if args.len() >= 2 && args[1] == "migrate-repair" {
        // Human: Checksum repair is a dev-only escape hatch; production must never rewrite migration history.
        // Agent: READS CLOUDWRKZ_DEPLOYMENT; EXITS 1 when production; CALLS db::repair_migration_checksums otherwise.
        if std::env::var("CLOUDWRKZ_DEPLOYMENT").as_deref() == Ok("production") {
            eprintln!(
                "migrate-repair is disabled when CLOUDWRKZ_DEPLOYMENT=production. \
                 Never edit applied migrations in production; ship a new migration file instead."
            );
            std::process::exit(1);
        }
        let db_url = match std::env::var("DATABASE_URL") {
            Ok(u) => u,
            Err(_) => {
                eprintln!("DATABASE_URL must be set for migrate-repair");
                std::process::exit(1);
            }
        };
        let pool = match db::create_pool(&db_url).await {
            Ok(p) => p,
            Err(e) => {
                eprintln!("Failed to connect to database: {e}");
                std::process::exit(1);
            }
        };
        match db::repair_migration_checksums(&pool).await {
            Ok(n) => {
                eprintln!("migrate-repair: updated {n} checksum(s) in _sqlx_migrations.");
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("migrate-repair failed: {e}");
                std::process::exit(1);
            }
        }
    }

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
        job_queue_worker_count = config.job_queue_worker_count,
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

    let api_started_at = std::time::Instant::now();

    // Apply migrations and start the background job worker pool before accepting HTTP traffic.
    // Otherwise clients can enqueue `background_jobs` rows while no worker is running yet,
    // and mutation polling (POST → 202 → GET /mutation-jobs/:id) appears stuck until the worker catches up.
    db::run_migrations_with_transient_retries(&pool).await;
    let initial_worker_count = job_queue::resolve_initial_worker_count(&pool, &config).await;
    let mutation_broker = routes::mutation_broker_for_config(&config);
    let job_worker_supervisor = job_queue::spawn_job_queue_supervisor(
        pool.clone(),
        config.clone(),
        mutation_broker.clone(),
        initial_worker_count,
        config.job_queue_worker_count,
    );
    let state = routes::AppState::new(
        pool.clone(),
        config.clone(),
        api_started_at,
        mutation_broker,
        job_worker_supervisor,
    );
    tracing::info!(
        event = "job_queue.supervisor",
        desired_dispatchers = initial_worker_count,
        env_default_dispatchers = config.job_queue_worker_count,
        "Background job dispatcher pool configured"
    );

    let app = build_http_app(state);

    let addr: SocketAddr = config.bind_addr().parse().expect("Invalid bind address");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    tracing::info!(event = "listen", addr = %addr, "Listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .expect("Server error");
}
