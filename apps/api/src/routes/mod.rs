// Human: Composes every `/api/v1` sub-router plus shared `AppState` construction so binaries and tests mount one typed router tree.
// Agent: DEFINES AppState fields; v1_router MERGES domain routers + auth rate limit layer; mutation_broker_for_config WIRES idempotency + mutation queue limits.

pub mod admin;
pub mod archive;
pub mod auth;
pub mod auth_qr_login;
pub mod collections;
pub mod contact;
pub mod favicons;
pub mod filter_preferences;
pub mod health;
pub mod helpers;
pub mod links;
pub mod location_history;
pub mod me;
pub mod mutation_jobs;
pub mod profile;
pub mod search;
pub mod tickets;
pub mod time_tracking;
pub mod todos;
pub mod users;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::auth::login_queue::LoginJobs;
use crate::auth::register_queue::RegisterJobs;
use crate::command_queue::{IdempotencyStore, MutationBroker, MutationJobs};
use crate::config::AppConfig;

/// Builds the mutation broker used by HTTP handlers and the background job queue (must be shared).
// Human: One broker instance coordinates queued writes, idempotency keys, and DB transaction timeouts across HTTP and background jobs.
// Agent: READS idempotency_max_entries + ttl + mutation tx/lock/statement timeouts + queue capacity; CONSTRUCTS IdempotencyStore + MutationBroker::new.

pub fn mutation_broker_for_config(config: &AppConfig) -> MutationBroker {
    let idempotency = IdempotencyStore::new(
        config.idempotency_max_entries,
        Duration::from_secs(config.idempotency_ttl_secs),
    );
    MutationBroker::new(
        idempotency,
        config.mutation_tx_max_ms,
        config.mutation_lock_timeout_ms,
        config.mutation_statement_timeout_ms,
        config.mutation_queue_capacity,
    )
}

impl AppState {
    // Human: Central dependency injection bundle created at process start; clones are cheap thanks to `Arc` fields inside nested structs.
    // Agent: STORES pool, config, timers, login/register job maps, mutation broker/jobs, search_coalesce mutex, job_worker_supervisor Arc.

    pub fn new(
        pool: PgPool,
        config: AppConfig,
        api_started_at: std::time::Instant,
        mutation_broker: MutationBroker,
        job_worker_supervisor: std::sync::Arc<crate::JobWorkerSupervisor>,
    ) -> Self {
        Self {
            pool,
            config,
            api_started_at,
            register_jobs: RegisterJobs::default(),
            login_jobs: LoginJobs::default(),
            mutation_broker,
            mutation_jobs: MutationJobs::default(),
            search_coalesce: Arc::new(Mutex::new(HashMap::new())),
            job_worker_supervisor,
        }
    }
}

// Human: This is the full authenticated product API surface mounted under `/api/v1` in `lib.rs`, with auth routes behind IP rate limiting.
// Agent: MERGES routers health, auth+nested qr-login, me, users, mutation_jobs, tickets, todos, links, collections, time_tracking, employees, search, profile, contact, admin, archive, filter_preferences, favicons, location_history.

pub fn v1_router(config: &AppConfig) -> Router<AppState> {
    Router::new()
        .merge(health::v1_router())
        .merge(
            auth::router()
                .nest("/auth/qr-login", auth_qr_login::scoped_router())
                .layer(crate::auth_governor::auth_rate_limit_layer(config)),
        )
        .merge(me::router())
        .merge(users::router())
        .merge(mutation_jobs::router())
        .merge(tickets::router())
        .merge(todos::router())
        .merge(links::router())
        .merge(collections::router())
        .merge(time_tracking::router())
        .merge(search::router())
        .merge(profile::router())
        .merge(contact::router())
        .merge(admin::router())
        .merge(archive::router())
        .merge(filter_preferences::router())
        .merge(favicons::router())
        .merge(location_history::router())
}

pub type SearchCoalesceCache = Arc<Mutex<HashMap<String, Arc<Mutex<Option<serde_json::Value>>>>>>;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: AppConfig,
    pub api_started_at: std::time::Instant,
    pub register_jobs: RegisterJobs,
    pub login_jobs: LoginJobs,
    pub mutation_broker: MutationBroker,
    pub mutation_jobs: MutationJobs,
    /// Background `background_jobs` dispatcher pool (supervisor, desired count, logs).
    pub job_worker_supervisor: std::sync::Arc<crate::JobWorkerSupervisor>,
    /// In-flight dedup for identical search keys (short-lived; bounded by map clear).
    pub search_coalesce: SearchCoalesceCache,
}
