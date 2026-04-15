pub mod admin;
pub mod archive;
pub mod auth;
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

pub fn v1_router(pool: PgPool, config: AppConfig, api_started_at: std::time::Instant) -> Router {
    let idempotency = IdempotencyStore::new(
        config.idempotency_max_entries,
        Duration::from_secs(config.idempotency_ttl_secs),
    );
    let mutation_broker = MutationBroker::new(
        idempotency,
        config.mutation_tx_max_ms,
        config.mutation_lock_timeout_ms,
        config.mutation_statement_timeout_ms,
        config.mutation_queue_capacity,
    );
    Router::new()
        .merge(health::v1_router())
        .merge(auth::router().layer(crate::auth_governor::auth_rate_limit_layer(&config)))
        .merge(me::router())
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
        .with_state(AppState {
            pool,
            config,
            api_started_at,
            register_jobs: RegisterJobs::default(),
            login_jobs: LoginJobs::default(),
            mutation_broker,
            mutation_jobs: MutationJobs::default(),
            search_coalesce: Arc::new(Mutex::new(HashMap::new())),
        })
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
    /// In-flight dedup for identical search keys (short-lived; bounded by map clear).
    pub search_coalesce: SearchCoalesceCache,
}
