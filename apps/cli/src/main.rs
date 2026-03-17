//! CloudWrkz CLI — database and admin tasks (seed, migrate, status, stats).
//!
//! Usage:
//!   cloudwrkz-cli db seed       Run seed SQL (modules + permissions)
//!   cloudwrkz-cli db migrate    Run pending SQLx migrations
//!   cloudwrkz-cli db status     Check database connection
//!   cloudwrkz-cli db stats      Show table counts

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

#[derive(Parser)]
#[command(name = "cloudwrkz-cli")]
#[command(about = "CloudWrkz CLI for database and admin tasks", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Database maintenance: seed, migrate, status, stats
    Db {
        #[command(subcommand)]
        subcommand: DbCommand,
    },
}

#[derive(Subcommand)]
enum DbCommand {
    /// Seed modules and permissions (idempotent). Uses apps/api/migrations/002_seed_data.sql
    Seed {
        /// Directory containing migrations (default: apps/api/migrations from cwd)
        #[arg(long, env = "MIGRATIONS_DIR")]
        migrations_dir: Option<PathBuf>,
    },
    /// Run pending SQLx migrations
    Migrate {
        /// Directory containing migrations (default: apps/api/migrations from cwd)
        #[arg(long, env = "MIGRATIONS_DIR")]
        migrations_dir: Option<PathBuf>,
    },
    /// Check database connection
    Status,
    /// Show table row counts
    Stats,
}

fn migrations_dir(given: Option<PathBuf>) -> PathBuf {
    given.unwrap_or_else(|| {
        std::env::current_dir()
            .ok()
            .map(|cwd| cwd.join("apps/api/migrations"))
            .unwrap_or_else(|| PathBuf::from("apps/api/migrations"))
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL").map_err(|_| {
        "DATABASE_URL must be set (e.g. in .env or apps/api/.env)".to_string()
    })?;

    let cli = Cli::parse();

    match cli.command {
        Commands::Db { subcommand } => match subcommand {
            DbCommand::Seed { migrations_dir: dir } => {
                let dir = migrations_dir(dir);
                run_seed(&database_url, &dir).await?;
            }
            DbCommand::Migrate { migrations_dir: dir } => {
                let dir = migrations_dir(dir);
                run_migrate(&database_url, &dir).await?;
            }
            DbCommand::Status => run_status(&database_url).await?,
            DbCommand::Stats => run_stats(&database_url).await?,
        },
    }

    Ok(())
}

async fn pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(2)
        .connect(database_url)
        .await
}

async fn run_seed(database_url: &str, migrations_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let seed_file = migrations_dir.join("002_seed_data.sql");
    let sql = std::fs::read_to_string(&seed_file).map_err(|e| {
        format!(
            "Failed to read seed file {}: {}. Set MIGRATIONS_DIR or run from repo root.",
            seed_file.display(),
            e
        )
    })?;

    println!("Seeding database from {} ...", seed_file.display());
    let pool = pool(database_url).await?;

    // Run the seed SQL (multiple statements via raw_sql).
    let mut conn = pool.acquire().await?;
    sqlx::raw_sql(&sql).execute(&mut *conn).await?;

    let modules: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM modules")
        .fetch_one(&pool)
        .await?;
    let permissions: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM permissions")
        .fetch_one(&pool)
        .await?;

    println!("Seed complete. Modules: {}, Permissions: {}", modules.0, permissions.0);
    pool.close().await;
    Ok(())
}

async fn run_migrate(database_url: &str, migrations_dir: &PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if !migrations_dir.exists() {
        return Err(format!(
            "Migrations directory not found: {}. Set MIGRATIONS_DIR or run from repo root.",
            migrations_dir.display()
        )
        .into());
    }

    println!("Running migrations from {} ...", migrations_dir.display());
    let pool = pool(database_url).await?;

    let migrator = sqlx::migrate::Migrator::new(migrations_dir.clone()).await?;
    migrator.run(&pool).await?;

    println!("Migrations complete.");
    pool.close().await;
    Ok(())
}

async fn run_status(database_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pool = pool(database_url).await?;

    let _: (i32,) = sqlx::query_as("SELECT 1").fetch_one(&pool).await?;
    let users: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users").fetch_one(&pool).await?;

    println!("Database: connected");
    println!("Users:   {}", users.0);
    pool.close().await;
    Ok(())
}

async fn run_stats(database_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pool = pool(database_url).await?;

    async fn count(pool: &PgPool, table: &str) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
            .fetch_one(pool)
            .await?;
        Ok(row.0)
    }

    let (users, sessions, modules, permissions, tickets, todos, time_entries, links) = tokio::try_join!(
        count(&pool, "users"),
        count(&pool, "sessions"),
        count(&pool, "modules"),
        count(&pool, "permissions"),
        count(&pool, "tickets"),
        count(&pool, "todos"),
        count(&pool, "time_entries"),
        count(&pool, "links"),
    )?;

    println!("Users:        {}", users);
    println!("Sessions:     {}", sessions);
    println!("Modules:      {}", modules);
    println!("Permissions:  {}", permissions);
    println!("Tickets:      {}", tickets);
    println!("Todos:        {}", todos);
    println!("Time entries: {}", time_entries);
    println!("Links:        {}", links);

    pool.close().await;
    Ok(())
}
