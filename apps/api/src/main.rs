mod auth;
mod config;
mod db;
mod error;
mod id;
mod models;
mod routes;

use axum::Router;
use std::net::SocketAddr;
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;
use tracing_subscriber::EnvFilter;
use axum::http::Method;

use config::AppConfig;

fn init_logging() {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let use_json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    let fmt = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false);
    if use_json {
        fmt.json()
            .with_current_span(false)
            .with_span_list(false)
            .init();
    } else {
        fmt.init();
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    init_logging();

    let config = AppConfig::from_env();
    tracing::info!(bind = %config.bind_addr(), "Starting CloudWrkz API");

    let pool = db::create_pool(&config.database_url)
        .await
        .expect("Failed to create database pool");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    let cors = build_cors(&config);

    let v1 = routes::v1_router(pool.clone(), config.clone());

    let app = Router::new()
        .nest("/api/v1", v1)
        .merge(routes::health::router(pool.clone()))
        .layer(cors)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .layer(tower_http::limit::RequestBodyLimitLayer::new(
            config.max_body_size,
        ));

    let addr: SocketAddr = config.bind_addr().parse().expect("Invalid bind address");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    tracing::info!(%addr, "Listening");

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
        _ = ctrl_c => { tracing::info!("Ctrl+C received, shutting down"); },
        _ = terminate => { tracing::info!("SIGTERM received, shutting down"); },
    }
}
