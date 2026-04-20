use sqlx::migrate::{Migrate, MigrateError};
use sqlx::postgres::{PgConnection, PgPool, PgPoolOptions};
use std::collections::HashMap;
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
            "A migration was modified after it was applied (sqlx checksum mismatch). \
             Migrations must be immutable once shipped. \
             For a local dev database, align checksums without re-running SQL: \
             `cargo run -p cloudwrkz-api -- migrate-repair` (requires DATABASE_URL). \
             Alternative: install sqlx-cli and run `sqlx migrate repair` from `apps/api`. \
             If you can drop data, `sqlx database reset` from `apps/api` also clears this. \
             Production: never edit applied migrations; add a new migration instead."
                .into()
        }
        _ => String::new(),
    };
    if hint.is_empty() {
        format!("Failed to run migrations: {e}")
    } else {
        format!("Failed to run migrations: {e} — {hint}")
    }
}

/// Update `_sqlx_migrations.checksum` for rows whose bytes differ from the migration sources
/// embedded in this binary — same effect as `sqlx migrate repair`. Does not re-execute SQL.
pub async fn repair_migration_checksums(pool: &PgPool) -> Result<usize, MigrateError> {
    let migrator = sqlx::migrate!("./migrations");
    let by_version: HashMap<i64, _> = migrator.iter().map(|m| (m.version, m)).collect();

    let mut conn = pool.acquire().await.map_err(MigrateError::Execute)?;
    let pg: &mut PgConnection = &mut *conn;
    pg.ensure_migrations_table().await?;
    let applied = pg.list_applied_migrations().await?;

    let mut repaired = 0usize;
    for applied_m in applied {
        let Some(m) = by_version.get(&applied_m.version) else {
            continue;
        };
        if applied_m.checksum.as_ref() == m.checksum.as_ref() {
            continue;
        }
        sqlx::query(r#"UPDATE _sqlx_migrations SET checksum = $1 WHERE version = $2"#)
            .bind(m.checksum.as_ref())
            .bind(applied_m.version)
            .execute(&mut *conn)
            .await
            .map_err(MigrateError::Execute)?;
        repaired += 1;
    }
    Ok(repaired)
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
                tracing::info!(
                    event = "db.migrations_applied",
                    "database migrations applied"
                );
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
