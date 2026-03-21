use sqlx::migrate::MigrateError;
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

mod transient;

pub mod numbering;

pub(crate) use transient::is_transient_sqlx;

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn pool_options() -> PgPoolOptions {
    let acquire_secs = env_u64("DATABASE_POOL_ACQUIRE_TIMEOUT_SECS", 15).clamp(1, 120);
    let max_conn = env_u64("DATABASE_POOL_MAX_CONNECTIONS", 20).clamp(1, 500) as u32;
    PgPoolOptions::new()
        .max_connections(max_conn)
        // Do not keep warm connections when the database is down (avoids reconnect storms).
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(acquire_secs))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        // Drop broken idle connections (aborted TCP, etc.) instead of handing them to handlers.
        .test_before_acquire(true)
}

/// Single connect attempt (CLI, tests, or custom retry loops).
pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    pool_options().connect(database_url).await
}

/// Create a pool without establishing any connections upfront.
/// Connections are established lazily on first query, which lets the HTTP
/// listener start immediately even when PostgreSQL is unreachable.
pub fn create_pool_lazy(database_url: &str) -> Result<PgPool, sqlx::Error> {
    pool_options().connect_lazy(database_url)
}

fn migration_fatal_message(e: &MigrateError) -> String {
    let hint = match e {
        MigrateError::VersionMissing(v) => format!(
            "Database has migration version {} recorded but it is missing from this build. \
             Rebuild from repo root: cargo build -p cloudwrkz-api. \
             If the DB was migrated out of order, fix or reset the _sqlx_migrations table.",
            v
        ),
        MigrateError::VersionMismatch(_) => {
            "A migration was modified after being applied. Migrations must be immutable.".into()
        }
        _ => String::new(),
    };
    if hint.is_empty() {
        format!("Failed to run migrations: {e}")
    } else {
        format!("Failed to run migrations: {e} — {hint}")
    }
}

fn migrate_error_is_transient(e: &MigrateError) -> bool {
    match e {
        MigrateError::Execute(sqlx_err) => is_transient_sqlx(sqlx_err),
        _ => false,
    }
}

/// Run migrations; retry on transient DB errors until success or retry budget is exhausted.
pub async fn run_migrations_with_transient_retries(pool: &PgPool) {
    let max_retry_window = Duration::from_secs(env_u64("DATABASE_MIGRATE_RETRY_MAX_SECS", 300));
    let mut backoff = Duration::from_secs(1);
    const MAX_BACKOFF: Duration = Duration::from_secs(15);
    let started = std::time::Instant::now();

    loop {
        match sqlx::migrate!("./migrations").run(pool).await {
            Ok(()) => {
                tracing::info!(event = "db.migrations_applied", "database migrations applied");
                return;
            }
            Err(e) => {
                let retry = migrate_error_is_transient(&e) && started.elapsed() < max_retry_window;
                if !retry {
                    panic!("{}", migration_fatal_message(&e));
                }
                tracing::warn!(
                    event = "db.migrate_retry",
                    error = %e,
                    backoff_ms = backoff.as_millis() as u64,
                    "migration hit transient database error; retrying"
                );
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
    }
}
