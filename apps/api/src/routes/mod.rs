pub mod admin;
pub mod archive;
pub mod auth;
pub mod collections;
pub mod filter_preferences;
pub mod contact;
pub mod favicons;
pub mod health;
pub mod helpers;
pub mod links;
pub mod location_history;
pub mod me;
pub mod profile;
pub mod search;
pub mod tickets;
pub mod time_tracking;
pub mod todos;

use axum::Router;
use sqlx::PgPool;

use crate::config::AppConfig;

pub fn v1_router(pool: PgPool, config: AppConfig) -> Router {
    Router::new()
        .merge(health::v1_router())
        .merge(auth::router())
        .merge(me::router())
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
        .with_state(AppState { pool, config })
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: AppConfig,
}
