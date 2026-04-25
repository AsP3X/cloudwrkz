//! CloudWrkz CLI — database and admin tasks, plus interactive management (users, groups, modules, sessions).
//!
//! Usage:
//!   cloudwrkz-cli                 Interactive mode (menu-driven)
//!   cloudwrkz-cli login           Log in and print token for CLOUDWRKZ_TOKEN
//!   cloudwrkz-cli db seed         Run seed SQL (modules + permissions)
//!   cloudwrkz-cli db migrate      Run pending SQLx migrations
//!   cloudwrkz-cli db status       Check database connection
//!   cloudwrkz-cli db stats        Show table counts
//!   cloudwrkz-cli db reset        Drop + recreate schema and run migrations (destructive)
//!   cloudwrkz-cli admin create-admin <email> <password> [name]  Create first admin (DB only, no API)
//!   cloudwrkz-cli diagnostics-token generate   Store hashed token in DB; print plaintext once (for GET …/health/detailed).
//!                                                Prefer this in CI/deploy when you standardize on the CLI binary (equivalent to `cloudwrkz-api diagnostics-token generate`).

// Human: One binary covers scripted DB maintenance, headless admin bootstrap, token login printing, and the full ratatui operator console.
// Agent: CLAP subcommands Login Db Admin DiagnosticsToken; NO args -> run_interactive; DB cmds USE sqlx + migrations dir; TUI USES api::ApiClient + tui::run_tui.

mod api;
mod tui;

use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use argon2::Argon2;
use argon2::password_hash::{
    PasswordHasher, SaltString,
    rand_core::{OsRng, RngCore},
};
use clap::{Parser, Subcommand};
use colored::Colorize;
use inquire::{Confirm, Password, Text};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

const APP_NAME: &str = "CloudWrkz";
const FALLBACK_COLS: usize = 80;
const FALLBACK_ROWS: usize = 24;

/// Terminal dimensions (cols, rows). Cached for layout; use when drawing.
// Human: Help banners and separators need a width even when stdout is not a real tty (e.g. CI) so wrapping stays stable.
// Agent: CALLS crossterm::terminal::size; MAP u16->usize; FALLBACK 80x24.

fn terminal_size() -> (usize, usize) {
    crossterm::terminal::size()
        .map(|(c, r)| (c as usize, r as usize))
        .unwrap_or((FALLBACK_COLS, FALLBACK_ROWS))
}

/// Width for separators and layout (responsive to terminal).
// Human: Separator lines in help text stretch to the full terminal width so the CLI looks intentional in wide consoles.
// Agent: READS terminal_size().0 only.

fn terminal_cols() -> usize {
    terminal_size().0
}

/// One permission for use in grant/revoke and permission table. Display: key — name (category).
#[derive(Clone)]
struct PermissionOption {
    key: String,
    name: String,
    category: String,
}

impl std::fmt::Display for PermissionOption {
    // Human: Grant/revoke lists show key, human title, and category on one line so dense permission trees stay scannable in the TUI.
    // Agent: write! key — name (category) with spacing.

    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "  {}  —  {}  ({})", self.key, self.name, self.category)
    }
}

// Human: Admin permission JSON uses loose `serde_json::Value` rows; this normalizes missing fields to empty strings for stable menu sorting.
// Agent: READS key name category string fields with unwrap_or ""; BUILDS PermissionOption.

fn permission_option_from_json(p: &serde_json::Value) -> PermissionOption {
    PermissionOption {
        key: p
            .get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: p
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        category: p
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

const BACK_LABEL: &str = "← Back";

/// Filter items by case-insensitive substring; returns (filtered_items, original_indices).
/// The last item is always included if it is "← Back" so navigation remains possible.
// Human: Global search should never hide the back row, or operators could get trapped in a leaf screen with no exit affordance.
// Agent: FILTER to_lowercase contains q; TRACK original indices; IF BACK_LABEL last AND missing APPEND back row + index.

fn filter_by_search(items: &[String], query: &str) -> (Vec<String>, Vec<usize>) {
    if query.is_empty() {
        return (items.to_vec(), (0..items.len()).collect());
    }
    let q = query.to_lowercase();
    let mut filtered = Vec::new();
    let mut indices = Vec::new();
    let back_idx = items.len().saturating_sub(1);
    let has_back = items
        .get(back_idx)
        .map_or(false, |s| s.as_str() == BACK_LABEL);
    for (i, s) in items.iter().enumerate() {
        if s.to_lowercase().contains(&q) {
            filtered.push(s.clone());
            indices.push(i);
        }
    }
    if has_back && (indices.is_empty() || *indices.last().unwrap() != back_idx) {
        filtered.push(BACK_LABEL.to_string());
        indices.push(back_idx);
    }
    (filtered, indices)
}

/// Unique categories from permissions, sorted.
// Human: Grant/revoke sidebars group keys by product area; empty categories from malformed JSON are dropped before sorting.
// Agent: COLLECT category into HashSet remove ""; INTO Vec SORT.

fn categories_from_permissions(perms: &[PermissionOption]) -> Vec<String> {
    let mut cats: std::collections::HashSet<String> =
        perms.iter().map(|p| p.category.clone()).collect();
    cats.remove("");
    let mut list: Vec<String> = cats.into_iter().collect();
    list.sort();
    list
}

#[derive(Parser)]
#[command(name = "cloudwrkz-cli")]
#[command(about = "CloudWrkz CLI for database and admin tasks", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Log in with email/password and print session token (set CLOUDWRKZ_TOKEN for management menus)
    Login {
        #[arg(long, env = "CLOUDWRKZ_LOGIN_EMAIL")]
        email: Option<String>,
        #[arg(long, env = "CLOUDWRKZ_LOGIN_PASSWORD")]
        password: Option<String>,
    },
    /// Database maintenance: seed, migrate, status, stats
    Db {
        #[command(subcommand)]
        subcommand: DbCommand,
    },
    /// Bootstrap admin (bypasses API; use when no admin exists yet)
    Admin {
        #[command(subcommand)]
        subcommand: AdminCommand,
    },
    /// Generate diagnostics API token (stored hashed in DB; same as `cloudwrkz-api diagnostics-token generate`; prefer this subcommand in CI when the CLI is the shipped binary)
    DiagnosticsToken {
        #[command(subcommand)]
        subcommand: DiagnosticsTokenCommand,
    },
}

#[derive(Subcommand)]
enum DiagnosticsTokenCommand {
    /// Create or rotate the token for GET /api/v1/health/detailed (Bearer auth)
    Generate {
        /// Directory containing migrations (default: apps/api/migrations from cwd)
        #[arg(long, env = "MIGRATIONS_DIR")]
        migrations_dir: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum AdminCommand {
    /// Create an admin user in the database. Use when you have no admin yet; then log in with this account.
    CreateAdmin {
        /// Admin email (used to log in)
        email: String,
        /// Password (min 8 chars)
        password: String,
        /// Display name (optional)
        name: Option<String>,
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
    /// Drop and recreate public schema, then run migrations
    Reset {
        /// Directory containing migrations (default: apps/api/migrations from cwd)
        #[arg(long, env = "MIGRATIONS_DIR")]
        migrations_dir: Option<PathBuf>,
        /// Skip confirmation prompt
        #[arg(long)]
        yes: bool,
    },
}

// Human: Packaged binaries may run outside the repo, so `MIGRATIONS_DIR` overrides the default `apps/api/migrations` next to cwd.
// Agent: USE given OR cwd.join apps/api/migrations OR static fallback PathBuf.

fn migrations_dir(given: Option<PathBuf>) -> PathBuf {
    given.unwrap_or_else(|| {
        std::env::current_dir()
            .ok()
            .map(|cwd| cwd.join("apps/api/migrations"))
            .unwrap_or_else(|| PathBuf::from("apps/api/migrations"))
    })
}

/// Load env files in order:
/// 1. `.env` in the current directory (dotenvy does not override already-set shell vars).
/// 2. Blank `CLOUDWRKZ_*` values are removed so a later file can fill them (`from_path` never overrides).
/// 3. `apps/api/.env` — shared with `cloudwrkz-api` (`DATABASE_URL`, `API_PORT`, optional `CLOUDWRKZ_TOKEN`).
/// 4. `apps/cli/.env` — **overrides** (recommended place for `CLOUDWRKZ_TOKEN` so it always wins).
// Human: Layered env loading mirrors the API server so `DATABASE_URL` can live in `apps/api/.env` while the CLI token overrides from `apps/cli/.env`.
// Agent: dotenv root; unset blank CLOUDWRKZ_TOKEN/API_URL; from_path apps/api/.env; from_path_override apps/cli/.env.

fn load_dotenv() {
    dotenvy::dotenv().ok();
    unset_env_if_blank("CLOUDWRKZ_TOKEN");
    unset_env_if_blank("CLOUDWRKZ_API_URL");
    if let Some(path) = find_workspace_file("apps/api/.env") {
        let _ = dotenvy::from_path(&path);
    }
    if let Some(path) = find_workspace_file("apps/cli/.env") {
        let _ = dotenvy::from_path_override(path);
    }
}

// Human: Empty-string env vars block later files from supplying real values because dotenv refuses to override set keys.
// Agent: IF var exists AND trim empty unsafe remove_var; CALLED only from main thread before spawn.

fn unset_env_if_blank(key: &str) {
    match std::env::var(key) {
        Ok(v) if v.trim().is_empty() => {
            // SAFETY: `remove_var` is unsafe in Rust 2024; we only call from `main` before other
            // threads start, so no concurrent `getenv` in the same process.
            unsafe {
                std::env::remove_var(key);
            }
        }
        _ => {}
    }
}

/// Walks up from cwd, then from the executable directory, to find `relative_path` under a workspace root.
// Human: Developers run the CLI from subfolders or `target/release`, so we walk parents from cwd and from the exe path to find nested `.env` files.
// Agent: WALK cwd.parent chain test is_file; ELSE WALK exe.parent chain; RETURNS first match Option.

fn find_workspace_file(relative_path: &str) -> Option<PathBuf> {
    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = Some(cwd.as_path());
        while let Some(d) = dir {
            let candidate = d.join(relative_path);
            if candidate.is_file() {
                return Some(candidate);
            }
            dir = d.parent();
        }
    }
    let mut d = std::env::current_exe().ok()?.parent()?.to_path_buf();
    loop {
        let candidate = d.join(relative_path);
        if candidate.is_file() {
            return Some(candidate);
        }
        d = d.parent()?.to_path_buf();
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Parses clap commands for headless workflows, otherwise drops into the ratatui operator console used for day-two admin tasks.
    // Agent: load_dotenv; IF argc<=1 run_interactive; ELSE Cli::parse match Login|Db|Admin|DiagnosticsToken; EACH branch READS DATABASE_URL as needed.

    load_dotenv();

    // No arguments → interactive mode (port of Node CLI's "pnpm cli")
    if std::env::args().len() <= 1 {
        run_interactive().await?;
        return Ok(());
    }

    let cli = Cli::parse();

    match cli.command {
        Commands::Login { email, password } => {
            run_login(email, password).await?;
            return Ok(());
        }
        Commands::Db { subcommand } => {
            let database_url = std::env::var("DATABASE_URL").map_err(|_| {
                "DATABASE_URL must be set (e.g. in .env or apps/api/.env)".to_string()
            })?;
            match subcommand {
                DbCommand::Seed {
                    migrations_dir: dir,
                } => {
                    let dir = migrations_dir(dir);
                    run_seed(&database_url, &dir).await?;
                }
                DbCommand::Migrate {
                    migrations_dir: dir,
                } => {
                    let dir = migrations_dir(dir);
                    run_migrate(&database_url, &dir).await?;
                }
                DbCommand::Status => run_status(&database_url).await?,
                DbCommand::Stats => run_stats(&database_url).await?,
                DbCommand::Reset {
                    migrations_dir: dir,
                    yes,
                } => {
                    let dir = migrations_dir(dir);
                    run_reset(&database_url, &dir, yes).await?;
                }
            }
        }
        Commands::Admin { subcommand } => {
            let database_url = std::env::var("DATABASE_URL").map_err(|_| {
                "DATABASE_URL must be set (e.g. in .env or apps/api/.env)".to_string()
            })?;
            match subcommand {
                AdminCommand::CreateAdmin {
                    email,
                    password,
                    name,
                } => {
                    run_create_admin(&database_url, &email, &password, name.as_deref()).await?;
                }
            }
        }
        Commands::DiagnosticsToken { subcommand } => {
            let database_url = std::env::var("DATABASE_URL").map_err(|_| {
                "DATABASE_URL must be set (e.g. in .env or apps/api/.env)".to_string()
            })?;
            match subcommand {
                DiagnosticsTokenCommand::Generate {
                    migrations_dir: dir,
                } => {
                    let dir = migrations_dir(dir);
                    run_diagnostics_token_generate(&database_url, &dir).await?;
                }
            }
        }
    }

    Ok(())
}

const DIAGNOSTICS_TOKEN_SETTINGS_KEY: &str = "diagnostics_health_token_hash";

async fn run_diagnostics_token_generate(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Mirrors `cloudwrkz-api diagnostics-token generate` so CI can ship one binary; migrates first so `system_settings` exists.
    // Agent: run_migrate; CONNECT pool max 2; OsRng 32 bytes hex cwzd_; hash_password Argon2; UPSERT system_settings key diagnostics_health_token_hash; PRINT token once.

    run_migrate(database_url, migrations_dir).await?;

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(database_url)
        .await?;

    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);
    let suffix: String = raw.iter().map(|b| format!("{:02x}", b)).collect();
    let token = format!("cwzd_{suffix}");

    let hash = hash_password(&token).map_err(|e| format!("hash token: {e}"))?;
    let value = serde_json::json!(hash);
    sqlx::query(
        r#"INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
    )
    .bind(DIAGNOSTICS_TOKEN_SETTINGS_KEY)
    .bind(value)
    .execute(&pool)
    .await?;

    println!("{}", token);
    eprintln!(
        "{}",
        "Use: curl -H \"Authorization: Bearer <token>\" http://localhost:8080/api/v1/health/detailed"
            .cyan()
    );
    eprintln!(
        "{}",
        "Plaintext is printed only once; also available via Admin → System Settings.".dimmed()
    );
    Ok(())
}

async fn run_login(
    email: Option<String>,
    password: Option<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Headless login prompts when flags/env are missing, then prints shell export hints so operators can paste `CLOUDWRKZ_TOKEN` safely.
    // Agent: api_config + ApiClient::new; inquire Text/Password fallback; client.login; SUCCESS print token; ERR api::user_message exit 1.

    let (base_url, _) = api::api_config();
    let client = api::ApiClient::new(base_url.clone(), None);

    let email = email.unwrap_or_else(|| {
        Text::new("Email:")
            .prompt()
            .unwrap_or_default()
            .trim()
            .to_string()
    });
    let password = password.unwrap_or_else(|| {
        Password::new("Password:")
            .without_confirmation()
            .prompt()
            .unwrap_or_default()
    });

    if email.is_empty() || password.is_empty() {
        eprintln!("{} Email and password are required.", "✗".red());
        std::process::exit(1);
    }

    match client.login(&email, &password).await {
        Ok(res) => {
            let who = res.user.name.as_deref().unwrap_or(res.user.email.as_str());
            println!("{} Logged in as {}", "✓".green(), who);
            println!();
            println!(
                "{}",
                "The token below is your API session. Put it in CLOUDWRKZ_TOKEN so the CLI (interactive menus) and scripts can call the API."
                    .bright_black()
            );
            println!();
            println!("{}", "Where to set it:".cyan().bold());
            println!(
                "  {}  {}",
                "PowerShell (this window):".bright_black(),
                r#"$env:CLOUDWRKZ_TOKEN = "<paste token below>""#.cyan()
            );
            println!(
                "  {}     {}",
                "bash / zsh:".bright_black(),
                r#"export CLOUDWRKZ_TOKEN="<paste token below>""#.cyan()
            );
            println!(
                "  {} {}",
                "Optional:".bright_black(),
                "Recommended: apps/cli/.env with CLOUDWRKZ_TOKEN=... (override-loaded). Also works: repo root .env, or apps/api/.env."
                    .bright_black()
            );
            println!();
            println!("{}", "Token:".cyan().bold());
            println!("{}", res.token);
        }
        Err(e) => {
            eprintln!("{} Login failed.", "✗".red());
            eprintln!("{}", api::user_message(&e, &base_url));
            std::process::exit(1);
        }
    }
    Ok(())
}

/// Generate a CUID-like id (same format as API) for new user.
// Human: Bootstrap `create-admin` inserts rows compatible with Prisma-style string ids used everywhere else in the product.
// Agent: SAME algorithm as API id.rs: millis base36 + 16 random base36 chars prefixed c.

fn new_cuid() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let random_part: String = (0..16)
        .map(|_| {
            let idx = rand::random::<u8>() % 36;
            if idx < 10 {
                (b'0' + idx) as char
            } else {
                (b'a' + idx - 10) as char
            }
        })
        .collect();
    format!("c{}{}", base36(timestamp as u64), random_part)
}

// Human: Encodes the timestamp portion of the synthetic CUID without pulling in extra crates.
// Agent: DIV loop base 36 digits; SPECIAL n==0; REVERSE bytes to string.

fn base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let chars = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut result = Vec::new();
    while n > 0 {
        result.push(chars[(n % 36) as usize]);
        n /= 36;
    }
    result.reverse();
    String::from_utf8(result).unwrap()
}

/// Hash password with Argon2 (same as API) so the user can log in via API.
// Human: The bootstrap admin must use the same Argon2 parameters as the API’s `hash_password` or first login would always fail verification.
// Agent: SaltString::generate OsRng; Argon2::default hash_password; RETURN PHC string.

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

async fn run_create_admin(
    database_url: &str,
    email: &str,
    password: &str,
    name: Option<&str>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Creates only the very first `ADMIN` row in an empty install; later admins must go through the product so this stays a guarded bootstrap.
    // Agent: REQUIRES CLOUDWRKZ_BOOTSTRAP_SECRET non-empty; VALIDATES email+password length; CHECK no existing ADMIN; INSERT users role ADMIN; HANDLE unique violation.

    // Require bootstrap secret so DATABASE_URL alone is not enough (e.g. in CI or leaked env).
    let secret = std::env::var("CLOUDWRKZ_BOOTSTRAP_SECRET").unwrap_or_default();
    if secret.trim().is_empty() {
        eprintln!(
            "{} create-admin is protected. Set {} (any non-empty value) to allow bootstrap.",
            "✗".red(),
            "CLOUDWRKZ_BOOTSTRAP_SECRET".cyan()
        );
        eprintln!("  Example: export CLOUDWRKZ_BOOTSTRAP_SECRET=your-secret-here");
        std::process::exit(1);
    }

    let email = email.trim().to_lowercase();
    if email.is_empty() {
        eprintln!("{} Email is required.", "✗".red());
        std::process::exit(1);
    }
    if password.len() < 8 {
        eprintln!("{} Password must be at least 8 characters.", "✗".red());
        std::process::exit(1);
    }

    let hashed = hash_password(password).map_err(|e| {
        eprintln!("{} Password hashing failed: {}", "✗".red(), e);
        std::process::exit(1);
    })?;

    let id = new_cuid();
    let name = name.map(|s| s.to_string());

    let pool = pool(database_url).await?;

    // Only allow creating the first admin. After that, use API or web app.
    let existing: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1")
            .fetch_optional(&pool)
            .await?;
    if existing.is_some() {
        pool.close().await;
        eprintln!(
            "{} An admin user already exists. Create more users via the API or web app.",
            "✗".red()
        );
        std::process::exit(1);
    }

    let res = sqlx::query(
        r#"INSERT INTO users (id, email, name, password, role, status, email_verified,
                              timezone, theme, locale, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', true, 'UTC', 'system', 'en', NOW(), NOW())"#,
    )
    .bind(&id)
    .bind(&email)
    .bind(&name)
    .bind(&hashed)
    .execute(&pool)
    .await;

    pool.close().await;

    match res {
        Ok(_) => {
            println!("{} Admin user created: {}", "✓".green(), email);
            println!("  Log in with: {} login", "cloudwrkz-cli".cyan());
            println!("  Then use the management menus or the web app.");
        }
        Err(e) => {
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    eprintln!("{} A user with that email already exists.", "✗".red());
                    std::process::exit(1);
                }
            }
            return Err(e.into());
        }
    }
    Ok(())
}

/// Current TUI screen (and its data). All sub-UIs use the same sidebar + content layout.
// Human: A navigation stack of `AppScreen` values models nested menus without separate ratatui routes—pop equals Back.
// Agent: ENUM variants carry JSON blobs or selection state for users/groups/permissions/db output; Main is root.

#[derive(Clone)]
enum AppScreen {
    Main,
    /// User list: for_manage true => select pushes UserDetail; false => select pushes UserDetailsJson.
    UserList {
        users: Vec<serde_json::Value>,
        for_manage: bool,
        total: i64,
    },
    UserDetail {
        user_id: String,
        email: String,
        name: String,
        role: String,
        status: String,
    },
    StatusChoice {
        user_id: String,
        email: String,
    },
    RoleChoice {
        user_id: String,
        email: String,
    },
    Permissions {
        user_id: String,
        email: String,
        status: String,
    },
    GrantPermission {
        permissions: Vec<PermissionOption>,
        categories: Vec<String>,
        email: String,
        status: String,
        selected: HashSet<String>,
    },
    RevokeCategory {
        categories: Vec<String>,
        email: String,
        status: String,
    },
    RevokePermission {
        permissions: Vec<PermissionOption>,
        categories: Vec<String>,
        email: String,
        status: String,
        selected: HashSet<String>,
    },
    ConfirmDelete {
        user_id: String,
        email: String,
    },
    ConfirmRevoke {
        user_id: String,
        key: String,
    },
    GroupsList(Vec<serde_json::Value>),
    ModulesList(Vec<serde_json::Value>),
    SessionsList(Vec<serde_json::Value>),
    DbOutput(String),
    Help(String),
    UserDetailsJson(String),
    PermissionTable {
        _user_id: String,
        email: String,
        permissions: Vec<PermissionOption>,
    },
    ConfirmDbReset,
}

/// Main menu: right-panel action list for each sidebar row (must stay in sync with `AppScreen::Main`).
// Human: Sidebar index 0–6 maps to Users…Quit; tokenless rows show placeholders instead of calling APIs that would 401.
// Agent: MATCH section+has_token; RETURNS vec of localized action labels.

fn main_section_submenu(section: usize, has_token: bool) -> Vec<String> {
    match section {
        0 if !has_token => vec!["(Login required — set CLOUDWRKZ_TOKEN)".to_string()],
        0 => vec![
            "Manage user".to_string(),
            "List users".to_string(),
            "Show user".to_string(),
        ],
        1 if !has_token => vec!["(Login required)".to_string()],
        1 => vec!["List groups".to_string()],
        2 if !has_token => vec!["(Login required)".to_string()],
        2 => vec!["List modules".to_string()],
        3 if !has_token => vec!["(Login required)".to_string()],
        3 => vec!["List sessions".to_string()],
        4 => vec![
            "Status".to_string(),
            "Migrate".to_string(),
            "Seed".to_string(),
            "Stats".to_string(),
            "Reset (dangerous)".to_string(),
        ],
        5 => vec!["View help (press Enter)".to_string()],
        6 => vec!["Exit CLI".to_string()],
        _ => vec![],
    }
}

// Human: Labels feed both the main sidebar emoji row and the breadcrumb-style parent row on sub-screens.
// Agent: STATIC str match section index.

fn main_section_parent_label(section: usize) -> &'static str {
    match section {
        0 => "Users",
        1 => "Groups",
        2 => "Modules",
        3 => "Sessions",
        4 => "Database",
        5 => "Help",
        6 => "Quit",
        _ => "Menu",
    }
}

/// Left sidebar on sub-screens: parent section title + the same submenu entries as on the main menu.
// Human: Child screens keep the same left column structure so muscle memory from the home menu still applies one level deeper.
// Agent: PREPEND main_section_parent_label string; EXTEND with main_section_submenu(section, has_token).

fn sidebar_parent_plus_submenu(section: usize, has_token: bool) -> Vec<String> {
    let mut v = vec![main_section_parent_label(section).to_string()];
    v.extend(main_section_submenu(section, has_token));
    v
}

// Human: One string per user row keeps the ratatui list simple while still showing email, optional name, role, and status columns.
// Agent: MAP serde_json fields email name role status; FORMAT single line each.

fn user_list_rows(users: &[serde_json::Value]) -> Vec<String> {
    users
        .iter()
        .map(|u| {
            let email = u.get("email").and_then(|v| v.as_str()).unwrap_or("-");
            let name = u.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let role = u.get("role").and_then(|v| v.as_str()).unwrap_or("-");
            let status = u.get("status").and_then(|v| v.as_str()).unwrap_or("-");
            let n = if name.is_empty() { "" } else { name };
            format!("{} {} [{}] {}", email, n, role, status)
        })
        .collect()
}

/// Right-panel list for the current screen and sidebar selection (keeps sidebar + content in sync in the TUI).
// Human: This giant match is the single source of truth for what the right column shows for every `AppScreen` and sidebar index pair.
// Agent: MATCH AppScreen variant; COMPOSE main_section_submenu rows OR user lists OR permission pickers OR db/help text chunks; APPEND BACK_LABEL where navigation applies.

fn panel_content(screen: &AppScreen, sidebar_idx: usize, has_token: bool) -> Vec<String> {
    match screen {
        AppScreen::Main => main_section_submenu(sidebar_idx, has_token),
        AppScreen::UserList { users, .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                let mut rows = user_list_rows(users);
                rows.push(BACK_LABEL.to_string());
                rows
            }
        }
        AppScreen::UserDetail { .. } => match sidebar_idx {
            0 => main_section_submenu(0, true),
            2 => vec![
                "List users — use ← Back, then pick a user from the list.".to_string(),
                BACK_LABEL.to_string(),
            ],
            3 => vec![
                "Show user — use ← Back, then pick a user for JSON details.".to_string(),
                BACK_LABEL.to_string(),
            ],
            _ => vec![
                "View full details".to_string(),
                "Change display name".to_string(),
                "Verify email".to_string(),
                "Set status".to_string(),
                "Set role".to_string(),
                "Manage permissions".to_string(),
                "Delete user (soft)".to_string(),
                BACK_LABEL.to_string(),
            ],
        },
        AppScreen::StatusChoice { .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                vec![
                    "ACTIVE".to_string(),
                    "PENDING".to_string(),
                    "SUSPENDED".to_string(),
                    "BANNED".to_string(),
                    BACK_LABEL.to_string(),
                ]
            }
        }
        AppScreen::RoleChoice { .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                vec![
                    "USER".to_string(),
                    "ADMIN".to_string(),
                    "MODERATOR".to_string(),
                    "AGENT".to_string(),
                    BACK_LABEL.to_string(),
                ]
            }
        }
        AppScreen::Permissions { .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                vec![
                    "View permissions".to_string(),
                    "Grant permission".to_string(),
                    "Revoke permission".to_string(),
                    BACK_LABEL.to_string(),
                ]
            }
        }
        AppScreen::GrantPermission {
            permissions: perms,
            categories: cats,
            selected,
            ..
        } => {
            let filter = if sidebar_idx == 0 {
                None
            } else {
                cats.get(sidebar_idx.saturating_sub(1)).cloned()
            };
            let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                perms.iter().filter(|p| p.category == *c).collect()
            } else {
                perms.iter().collect()
            };
            let mut content: Vec<String> = filtered
                .iter()
                .map(|p| {
                    let mark = if selected.contains(&p.key) {
                        "☑ "
                    } else {
                        "  "
                    };
                    format!("{}{} — {} ({})", mark, p.key, p.name, p.category)
                })
                .collect();
            content.push(BACK_LABEL.to_string());
            content
        }
        AppScreen::RevokeCategory {
            categories: cats, ..
        } => {
            let mut content = cats.clone();
            content.push(BACK_LABEL.to_string());
            content
        }
        AppScreen::RevokePermission {
            permissions: perms,
            categories: cats,
            selected,
            ..
        } => {
            let filter = cats.get(sidebar_idx).cloned();
            let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                perms.iter().filter(|p| p.category == *c).collect()
            } else {
                perms.iter().collect()
            };
            let mut content: Vec<String> = filtered
                .iter()
                .map(|p| {
                    let mark = if selected.contains(&p.key) {
                        "☑ "
                    } else {
                        "  "
                    };
                    format!("{}{} — {} ({})", mark, p.key, p.name, p.category)
                })
                .collect();
            content.push(BACK_LABEL.to_string());
            content
        }
        AppScreen::ConfirmDelete { .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                vec![
                    "Yes, soft-delete this user".to_string(),
                    "No, cancel".to_string(),
                ]
            }
        }
        AppScreen::ConfirmRevoke { key, .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                vec![format!("Yes, revoke '{}'", key), "No, cancel".to_string()]
            }
        }
        AppScreen::GroupsList(groups) => {
            if sidebar_idx == 0 {
                main_section_submenu(1, has_token)
            } else {
                let mut rows: Vec<String> = groups
                    .iter()
                    .map(|g| {
                        let name = g.get("name").and_then(|v| v.as_str()).unwrap_or("-");
                        let desc = g.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        format!("{}  {}", name, desc)
                    })
                    .collect();
                rows.push(BACK_LABEL.to_string());
                rows
            }
        }
        AppScreen::ModulesList(modules) => {
            if sidebar_idx == 0 {
                main_section_submenu(2, has_token)
            } else {
                let mut rows: Vec<String> = modules
                    .iter()
                    .map(|m| {
                        let key = m.get("key").and_then(|v| v.as_str()).unwrap_or("-");
                        let enabled = m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                        format!("{}  {}", key, if enabled { "enabled" } else { "disabled" })
                    })
                    .collect();
                rows.push(BACK_LABEL.to_string());
                rows
            }
        }
        AppScreen::SessionsList(sessions) => {
            if sidebar_idx == 0 {
                main_section_submenu(3, has_token)
            } else {
                let mut rows: Vec<String> = sessions
                    .iter()
                    .map(|s| {
                        let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("-");
                        let email = s.get("userEmail").and_then(|v| v.as_str()).unwrap_or("-");
                        let exp = s.get("expiresAt").and_then(|v| v.as_str()).unwrap_or("-");
                        let id_short = if id.len() > 14 {
                            format!("{}…", &id[..14])
                        } else {
                            id.to_string()
                        };
                        format!("{}  {}  {}", id_short, email, exp)
                    })
                    .collect();
                rows.push(BACK_LABEL.to_string());
                rows
            }
        }
        AppScreen::DbOutput(text) => {
            if sidebar_idx == 0 {
                main_section_submenu(4, has_token)
            } else {
                let mut lines: Vec<String> =
                    text.lines().map(|s| s.to_string()).take(200).collect();
                lines.push(BACK_LABEL.to_string());
                lines
            }
        }
        AppScreen::Help(text) => {
            if sidebar_idx == 0 {
                main_section_submenu(5, has_token)
            } else {
                let mut lines: Vec<String> =
                    text.lines().map(|s| s.to_string()).take(200).collect();
                lines.push(BACK_LABEL.to_string());
                lines
            }
        }
        AppScreen::UserDetailsJson(text) => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                let mut lines: Vec<String> =
                    text.lines().map(|s| s.to_string()).take(200).collect();
                lines.push(BACK_LABEL.to_string());
                lines
            }
        }
        AppScreen::PermissionTable { permissions, .. } => {
            if sidebar_idx == 0 {
                main_section_submenu(0, true)
            } else {
                let mut rows: Vec<String> = permissions
                    .iter()
                    .map(|p| format!("{}  {}  ({})", p.key, p.name, p.category))
                    .collect();
                rows.push(BACK_LABEL.to_string());
                rows
            }
        }
        AppScreen::ConfirmDbReset => {
            if sidebar_idx == 0 {
                main_section_submenu(4, has_token)
            } else {
                vec!["Yes, reset database".to_string(), "No, cancel".to_string()]
            }
        }
    }
}

// Human: Maps abstract `AppScreen` + focus state into the four strings ratatui needs: left title, sidebar rows, right title, content rows, optional header block.
// Agent: MATCH screen; BUILD emoji sidebar for Main; OTHER screens CALL sidebar_parent_plus_submenu + panel_content; RETURN optional header tuple.

fn build_ui(
    screen: &AppScreen,
    has_token: bool,
    sidebar_index: usize,
) -> (
    String,
    Vec<String>,
    String,
    Vec<String>,
    Option<(Vec<String>, String)>,
) {
    match screen {
        AppScreen::Main => {
            let sidebar = vec![
                "👤 Users".to_string(),
                "👥 Groups".to_string(),
                "📦 Modules".to_string(),
                "🔐 Sessions".to_string(),
                "🗄️  Database".to_string(),
                "❓ Help".to_string(),
                "🚪 Quit".to_string(),
            ];
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " CloudWrkz ".to_string(),
                sidebar,
                " Actions ".to_string(),
                content,
                None,
            )
        }
        AppScreen::UserList { total, .. } => {
            let sidebar = sidebar_parent_plus_submenu(0, true);
            let content = panel_content(screen, sidebar_index, has_token);
            let title_right = format!(" Select user ({} total) ", total);
            (" Users ".to_string(), sidebar, title_right, content, None)
        }
        AppScreen::UserDetail {
            email,
            name,
            status,
            role: _role,
            ..
        } => {
            let username = name.trim();
            let user_label = if username.is_empty() {
                email.as_str()
            } else {
                username
            };
            let header = vec![
                format!("Root → User [{}] → Manage", user_label),
                format!("Status: {}", status),
                format!("Email: {}", email),
            ];
            let sidebar = sidebar_parent_plus_submenu(0, true);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " User ".to_string(),
                sidebar,
                " Sub menu options ".to_string(),
                content,
                Some((header, "User".to_string())),
            )
        }
        AppScreen::StatusChoice { email, .. } => {
            let mut sidebar = sidebar_parent_plus_submenu(0, true);
            sidebar.push(format!("Set status — {}", email));
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Status ".to_string(),
                sidebar,
                " Choose status ".to_string(),
                content,
                None,
            )
        }
        AppScreen::RoleChoice { email, .. } => {
            let mut sidebar = sidebar_parent_plus_submenu(0, true);
            sidebar.push(format!("Set role — {}", email));
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Role ".to_string(),
                sidebar,
                " Choose role ".to_string(),
                content,
                None,
            )
        }
        AppScreen::Permissions { email, status, .. } => {
            let header = vec![
                format!("Root → User [{}] → Manage permissions", email),
                format!("Status: {}", status),
                format!("Email: {}", email),
            ];
            let sidebar = sidebar_parent_plus_submenu(0, true);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Permissions ".to_string(),
                sidebar,
                " Sub menu options ".to_string(),
                content,
                Some((header, "Permissions".to_string())),
            )
        }
        AppScreen::GrantPermission {
            permissions: _,
            categories: cats,
            email,
            status,
            selected: _,
        } => {
            let header = vec![
                format!("Root → User [{}] → Grant permission", email),
                format!("Status: {}", status),
                format!("Email: {}", email),
                "Space: toggle selection  Enter: add selected".to_string(),
            ];
            let mut sidebar = vec!["All".to_string()];
            sidebar.extend(cats.clone());
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Grant ".to_string(),
                sidebar,
                " Permissions ".to_string(),
                content,
                Some((header, "Grant permission".to_string())),
            )
        }
        AppScreen::RevokeCategory {
            categories: cats,
            email,
            status,
        } => {
            let header = vec![
                format!("Root → User [{}] → Revoke permission", email),
                format!("Status: {}", status),
                format!("Email: {}", email),
            ];
            let sidebar = cats.clone();
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Revoke ".to_string(),
                sidebar,
                " Categories ".to_string(),
                content,
                Some((header, "Revoke permission".to_string())),
            )
        }
        AppScreen::RevokePermission {
            permissions: _,
            categories: cats,
            email,
            status,
            selected: _,
        } => {
            let header = vec![
                format!("Root → User [{}] → Revoke permission", email),
                format!("Status: {}", status),
                format!("Email: {}", email),
                "Space: toggle selection  Enter: revoke selected".to_string(),
            ];
            let sidebar = cats.clone();
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Revoke ".to_string(),
                sidebar,
                " Select to revoke ".to_string(),
                content,
                Some((header, "Revoke permission".to_string())),
            )
        }
        AppScreen::ConfirmDelete { email, .. } => {
            let mut sidebar = sidebar_parent_plus_submenu(0, true);
            sidebar.push(format!("Delete — {}", email));
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Confirm ".to_string(),
                sidebar,
                " Delete user? ".to_string(),
                content,
                None,
            )
        }
        AppScreen::ConfirmRevoke { key, .. } => {
            let mut sidebar = sidebar_parent_plus_submenu(0, true);
            sidebar.push(format!("Revoke — {}", key));
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Confirm ".to_string(),
                sidebar,
                " Revoke? ".to_string(),
                content,
                None,
            )
        }
        AppScreen::GroupsList(_) => {
            let sidebar = sidebar_parent_plus_submenu(1, has_token);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Groups ".to_string(),
                sidebar,
                " List ".to_string(),
                content,
                None,
            )
        }
        AppScreen::ModulesList(_) => {
            let sidebar = sidebar_parent_plus_submenu(2, has_token);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Modules ".to_string(),
                sidebar,
                " List ".to_string(),
                content,
                None,
            )
        }
        AppScreen::SessionsList(_) => {
            let sidebar = sidebar_parent_plus_submenu(3, has_token);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Sessions ".to_string(),
                sidebar,
                " List ".to_string(),
                content,
                None,
            )
        }
        AppScreen::DbOutput(_) => {
            let sidebar = sidebar_parent_plus_submenu(4, has_token);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Output ".to_string(),
                sidebar,
                " Result ".to_string(),
                content,
                None,
            )
        }
        AppScreen::Help(_) => {
            let sidebar = sidebar_parent_plus_submenu(5, has_token);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Help ".to_string(),
                sidebar,
                " Documentation ".to_string(),
                content,
                None,
            )
        }
        AppScreen::UserDetailsJson(_) => {
            let sidebar = sidebar_parent_plus_submenu(0, true);
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " User details ".to_string(),
                sidebar,
                " JSON ".to_string(),
                content,
                None,
            )
        }
        AppScreen::PermissionTable {
            email, permissions, ..
        } => {
            let mut sidebar = sidebar_parent_plus_submenu(0, true);
            sidebar.push(format!("Permissions — {}", email));
            let content = panel_content(screen, sidebar_index, has_token);
            (
                " Direct permissions ".to_string(),
                sidebar,
                format!(" {} ", permissions.len()),
                content,
                None,
            )
        }
        AppScreen::ConfirmDbReset => {
            let mut sidebar = sidebar_parent_plus_submenu(4, has_token);
            sidebar.push("Reset database".to_string());
            let content = panel_content(screen, sidebar_index, has_token);
            let header = vec![
                "WARNING: This will delete all data in schema public.".to_string(),
                "The schema will be recreated and migrations re-applied.".to_string(),
                "This action cannot be undone.".to_string(),
            ];
            (
                " Confirm reset ".to_string(),
                sidebar,
                " Danger zone ".to_string(),
                content,
                Some((header, "Database reset".to_string())),
            )
        }
    }
}

// Human: Full-screen prompts between TUI and println modes avoid leaving ratatui debris on the scrollback when we drop to line mode.
// Agent: crossterm execute Clear All MoveTo 0,0 on stdout.

fn clear_screen() {
    let _ = crossterm::execute!(
        std::io::stdout(),
        crossterm::terminal::Clear(crossterm::terminal::ClearType::All),
        crossterm::cursor::MoveTo(0, 0),
    );
}

// Human: Non-TUI messages still share a consistent branded banner width with the terminal ruler line.
// Agent: PRINT separator line terminal_cols; PRINT APP_NAME CLI title colored.

fn header(title: &str, subtitle: &str) {
    let w = terminal_cols();
    let line = "─".repeat(w);
    println!("{}", line.bright_black());
    println!("{}  {}", APP_NAME.cyan().bold(), "CLI".cyan().bold());
    println!("{}", line.bright_black());
    println!("{}", title.cyan().bold());
    println!("{}\n", subtitle.bright_black());
}

// Human: After informational println screens we block on stdin so fast operators can read the text before it scrolls away.
// Agent: READ_LINE stdin discard result.

fn wait_for_enter() {
    println!("{}", "Press Enter to continue...".bright_black());
    let mut buf = String::new();
    let _ = std::io::stdin().read_line(&mut buf);
}

async fn run_interactive() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: The interactive shell is a stack machine: each `tui::run_tui` pass may push/pop `AppScreen` values and optionally filter both panes via search.
    // Agent: REQUIRE DATABASE_URL; BUILD api_client; LOOP build_ui+panel_content; APPLY search_filter mapping; MATCH TuiExit dispatch_tui_action; BREAK Quit.

    let database_url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => {
            eprintln!(
                "{} {}",
                "✗".red(),
                "DATABASE_URL must be set (e.g. in .env or apps/api/.env)".red()
            );
            std::process::exit(1);
        }
    };

    let (api_base, api_token) = api::api_config();
    let api_client = api::ApiClient::new(api_base, api_token);
    let has_token = api_client.has_token();

    let mut tui_state = tui::TuiState::new();
    let mut stack: Vec<AppScreen> = vec![AppScreen::Main];
    let mut search_active = false;
    let mut search_query = String::new();
    let mut search_filter: Option<String> = None;

    loop {
        let screen = stack.last().expect("screen stack empty").clone();
        let sidebar_index = tui_state.sidebar_index;
        let (title_left, sidebar_items, title_right, _, header) =
            build_ui(&screen, has_token, sidebar_index);

        let base_content = panel_content(&screen, sidebar_index, has_token);

        let (display_sidebar, display_content, sidebar_orig_indices, content_orig_indices) =
            if let Some(ref q) = search_filter {
                let (fs, si) = filter_by_search(&sidebar_items, q);
                let (fc, ci) = filter_by_search(&base_content, q);
                (fs, fc, si, ci)
            } else {
                (
                    sidebar_items.clone(),
                    base_content.clone(),
                    (0..sidebar_items.len()).collect(),
                    (0..base_content.len()).collect(),
                )
            };

        // While search filters the panel, keep content static; otherwise sidebar arrows refresh the right column.
        let mut content_callback: Option<Box<dyn FnMut(usize) -> Vec<String>>> = None;
        if search_filter.is_none() {
            let s = screen.clone();
            let tok = has_token;
            content_callback = Some(Box::new(move |idx| panel_content(&s, idx, tok)));
        }

        let exit = tui::run_tui(
            &mut tui_state,
            &title_left,
            &display_sidebar,
            &title_right,
            &display_content,
            header
                .as_ref()
                .map(|(lines, title)| (lines.as_slice(), title.as_str())),
            if search_active {
                Some(&mut search_query)
            } else {
                None
            },
            content_callback.as_deref_mut(),
        )
        .map_err(Box::new)?;

        match exit {
            tui::TuiExit::Quit => break,
            tui::TuiExit::Back => {
                if stack.len() > 1 {
                    stack.pop();
                    search_filter = None;
                } else {
                    break;
                }
            }
            tui::TuiExit::OpenSearch => {
                search_active = true;
                // Start with an empty query; results will live-update on each keypress.
                search_query.clear();
                search_filter = None;
            }
            tui::TuiExit::SearchChanged(query) => {
                search_active = true;
                search_filter = if query.is_empty() {
                    None
                } else {
                    Some(query.clone())
                };
                search_query = query;
            }
            tui::TuiExit::SearchDone(query) => {
                search_active = false;
                search_filter = if query.is_empty() {
                    None
                } else {
                    Some(query.clone())
                };
                search_query = query;
            }
            tui::TuiExit::SearchCancel => {
                search_active = false;
                search_filter = None;
                search_query.clear();
            }
            tui::TuiExit::ToggleSelect(sb_idx, content_idx) => {
                if let Some(top) = stack.last_mut() {
                    match top {
                        AppScreen::GrantPermission {
                            permissions,
                            categories,
                            selected,
                            ..
                        } => {
                            let filter = if sb_idx == 0 {
                                None
                            } else {
                                categories.get(sb_idx.saturating_sub(1)).cloned()
                            };
                            let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                                permissions.iter().filter(|p| p.category == *c).collect()
                            } else {
                                permissions.iter().collect()
                            };
                            if content_idx < filtered.len() {
                                let key = filtered[content_idx].key.clone();
                                if selected.contains(&key) {
                                    selected.remove(&key);
                                } else {
                                    selected.insert(key);
                                }
                            }
                        }
                        AppScreen::RevokePermission {
                            permissions,
                            categories,
                            selected,
                            ..
                        } => {
                            let filter = categories.get(sb_idx).cloned();
                            let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                                permissions.iter().filter(|p| p.category == *c).collect()
                            } else {
                                permissions.iter().collect()
                            };
                            if content_idx < filtered.len() {
                                let key = filtered[content_idx].key.clone();
                                if selected.contains(&key) {
                                    selected.remove(&key);
                                } else {
                                    selected.insert(key);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            tui::TuiExit::Select(sb_idx, content_idx) => {
                let real_sb = sidebar_orig_indices.get(sb_idx).copied().unwrap_or(sb_idx);
                let real_content = content_orig_indices
                    .get(content_idx)
                    .copied()
                    .unwrap_or(content_idx);
                let handled = dispatch_tui_action(
                    &mut tui_state,
                    &mut stack,
                    &screen,
                    real_sb,
                    real_content,
                    &sidebar_items,
                    has_token,
                    &api_client,
                    &database_url,
                )
                .await?;
                search_filter = None;
                if handled == DispatchResult::Quit {
                    break;
                }
            }
        }
    }
    println!(
        "{}",
        format!("Thank you for using {} CLI. Goodbye! 👋", APP_NAME).bright_blue()
    );
    Ok(())
}

#[derive(PartialEq)]
enum DispatchResult {
    Continue,
    Quit,
}

// Human: Every Enter/Space on a menu row is interpreted here—this is where API calls, stack pushes, and destructive confirms are centralized.
// Agent: READ panel_content for BACK detection; MATCH screen variant; AWAIT api_client or sqlx helpers; MUTATE stack + tui_state.sidebar_index; RETURN Continue|Quit.

async fn dispatch_tui_action(
    tui_state: &mut tui::TuiState,
    stack: &mut Vec<AppScreen>,
    screen: &AppScreen,
    sb_idx: usize,
    content_idx: usize,
    _sidebar_items: &[String],
    has_token: bool,
    api_client: &api::ApiClient,
    database_url: &str,
) -> Result<DispatchResult, Box<dyn std::error::Error + Send + Sync>> {
    let live = panel_content(screen, sb_idx, has_token);
    let is_back = content_idx < live.len()
        && live
            .get(content_idx)
            .is_some_and(|s| s.trim() == BACK_LABEL);

    match screen {
        AppScreen::Main => {
            // content "← Back" on main doesn't exist; sb_idx = main menu index (0=Users, ... 6=Quit)
            let main_idx = sb_idx;
            match main_idx {
                0 if !has_token => {
                    show_login_required();
                    wait_for_enter();
                }
                0 => match content_idx {
                    0 => {
                        let res = api_client.list_users().await?;
                        tui_state.sidebar_index = 1;
                        stack.push(AppScreen::UserList {
                            users: res.users,
                            for_manage: true,
                            total: res.total,
                        });
                    }
                    1 | 2 => {
                        let res = api_client.list_users().await?;
                        tui_state.sidebar_index = 1 + content_idx;
                        stack.push(AppScreen::UserList {
                            users: res.users,
                            for_manage: false,
                            total: res.total,
                        });
                    }
                    _ => {}
                },
                1 if has_token => {
                    let res = api_client.list_groups().await?;
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::GroupsList(res.groups));
                }
                2 if has_token => {
                    let res = api_client.list_modules().await?;
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::ModulesList(res.modules));
                }
                3 if has_token => {
                    let res = api_client.list_sessions().await?;
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::SessionsList(res.sessions));
                }
                4 => {
                    if content_idx == 4 {
                        tui_state.sidebar_index = 1;
                        stack.push(AppScreen::ConfirmDbReset);
                    } else {
                        let dir = migrations_dir(None);
                        let out = run_db_action_capture(database_url, content_idx, &dir).await?;
                        tui_state.sidebar_index = 1 + content_idx;
                        stack.push(AppScreen::DbOutput(out));
                    }
                }
                5 => {
                    let text = help_text();
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::Help(text));
                }
                6 => return Ok(DispatchResult::Quit),
                _ => {}
            }
        }
        AppScreen::UserList { users, .. } => {
            if sb_idx == 0 {
                match content_idx {
                    0 => {
                        if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                            *for_manage = true;
                        }
                        tui_state.sidebar_index = 1;
                        return Ok(DispatchResult::Continue);
                    }
                    1 => {
                        if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                            *for_manage = false;
                        }
                        tui_state.sidebar_index = 2;
                        return Ok(DispatchResult::Continue);
                    }
                    2 => {
                        if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                            *for_manage = false;
                        }
                        tui_state.sidebar_index = 3;
                        return Ok(DispatchResult::Continue);
                    }
                    _ => {}
                }
            }
            if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                match sb_idx {
                    1 => *for_manage = true,
                    2 | 3 => *for_manage = false,
                    _ => {}
                }
            }
            let for_manage = match stack.last() {
                Some(AppScreen::UserList { for_manage, .. }) => *for_manage,
                _ => false,
            };
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            if let Some(u) = users.get(content_idx) {
                let id = u
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let email = u
                    .get("email")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = u
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let role = u
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("-")
                    .to_string();
                let status = u
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("-")
                    .to_string();
                if for_manage {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::UserDetail {
                        user_id: id,
                        email,
                        name,
                        role,
                        status,
                    });
                } else {
                    let v = api_client.get_user(&id).await?;
                    let pretty = serde_json::to_string_pretty(
                        v.get("user").unwrap_or(&serde_json::Value::Null),
                    )?;
                    tui_state.sidebar_index = 3;
                    stack.push(AppScreen::UserDetailsJson(pretty));
                }
            }
        }
        AppScreen::UserDetail {
            user_id,
            email,
            status,
            ..
        } => {
            if sb_idx == 0 {
                match content_idx {
                    0 => return Ok(DispatchResult::Continue),
                    1 => {
                        stack.pop();
                        if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                            *for_manage = false;
                        }
                        tui_state.sidebar_index = 2;
                        return Ok(DispatchResult::Continue);
                    }
                    2 => {
                        stack.pop();
                        if let Some(AppScreen::UserList { for_manage, .. }) = stack.last_mut() {
                            *for_manage = false;
                        }
                        tui_state.sidebar_index = 3;
                        return Ok(DispatchResult::Continue);
                    }
                    _ => {}
                }
            }
            if sb_idx == 2 || sb_idx == 3 {
                if is_back {
                    stack.pop();
                }
                return Ok(DispatchResult::Continue);
            }
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let user_id = user_id.clone();
            let email = email.clone();
            let status = status.clone();
            match content_idx {
                0 => {
                    let v = api_client.get_user(&user_id).await?;
                    let pretty = serde_json::to_string_pretty(
                        v.get("user").unwrap_or(&serde_json::Value::Null),
                    )?;
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::UserDetailsJson(pretty));
                }
                1 => {
                    let name = inquire::Text::new("New display name (empty to clear):").prompt();
                    if let Ok(n) = name {
                        let val = if n.trim().is_empty() {
                            None
                        } else {
                            Some(n.trim().to_string())
                        };
                        let _ = api_client
                            .update_user(&user_id, val.as_deref(), None, None)
                            .await;
                    }
                }
                2 => {
                    let _ = run_verify_email(database_url, &user_id).await;
                }
                3 => {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::StatusChoice { user_id, email });
                }
                4 => {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::RoleChoice { user_id, email });
                }
                5 => {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::Permissions {
                        user_id,
                        email,
                        status,
                    });
                }
                6 => {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::ConfirmDelete { user_id, email });
                }
                7 => {
                    stack.pop();
                }
                _ => {}
            }
        }
        AppScreen::StatusChoice { user_id, .. } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let statuses = ["ACTIVE", "PENDING", "SUSPENDED", "BANNED"];
            if let Some(&s) = statuses.get(content_idx) {
                let _ = api_client.update_user(user_id, None, None, Some(s)).await;
            }
            stack.pop();
        }
        AppScreen::RoleChoice { user_id, .. } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let roles = ["USER", "ADMIN", "MODERATOR", "AGENT"];
            if let Some(&r) = roles.get(content_idx) {
                let _ = api_client.update_user(user_id, None, Some(r), None).await;
            }
            stack.pop();
        }
        AppScreen::Permissions {
            user_id,
            email,
            status,
        } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            match content_idx {
                0 => {
                    let res = api_client.list_user_permissions(user_id).await?;
                    let perms: Vec<PermissionOption> = res
                        .permissions
                        .iter()
                        .map(permission_option_from_json)
                        .collect();
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::PermissionTable {
                        _user_id: user_id.clone(),
                        email: email.clone(),
                        permissions: perms,
                    });
                }
                1 => {
                    let all = api_client.list_permissions().await?;
                    let user_perms = api_client.list_user_permissions(user_id).await.ok();
                    let existing: std::collections::HashSet<String> = user_perms
                        .as_ref()
                        .map(|r| {
                            r.permissions
                                .iter()
                                .filter_map(|p| {
                                    p.get("key").and_then(|v| v.as_str()).map(String::from)
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    let mut available: Vec<PermissionOption> = all
                        .permissions
                        .iter()
                        .filter(|p| {
                            let k = p.get("key").and_then(|v| v.as_str()).unwrap_or("");
                            !existing.contains(k)
                        })
                        .map(permission_option_from_json)
                        .collect();
                    available.sort_by(|a, b| {
                        a.category.cmp(&b.category).then_with(|| a.key.cmp(&b.key))
                    });
                    let categories = categories_from_permissions(&available);
                    tui_state.sidebar_index = 0;
                    tui_state.content_index = 0;
                    stack.push(AppScreen::GrantPermission {
                        permissions: available,
                        categories,
                        email: email.clone(),
                        status: status.clone(),
                        selected: HashSet::new(),
                    });
                }
                2 => {
                    let res = api_client.list_user_permissions(user_id).await?;
                    if res.permissions.is_empty() {
                        stack.pop();
                        return Ok(DispatchResult::Continue);
                    }
                    let mut opts: Vec<PermissionOption> = res
                        .permissions
                        .iter()
                        .map(permission_option_from_json)
                        .collect();
                    opts.sort_by(|a, b| {
                        a.category.cmp(&b.category).then_with(|| a.key.cmp(&b.key))
                    });
                    let categories = categories_from_permissions(&opts);
                    if categories.len() > 1 {
                        tui_state.sidebar_index = 0;
                        stack.push(AppScreen::RevokeCategory {
                            categories,
                            email: email.clone(),
                            status: status.clone(),
                        });
                    } else {
                        tui_state.sidebar_index = 0;
                        tui_state.content_index = 0;
                        stack.push(AppScreen::RevokePermission {
                            permissions: opts,
                            categories,
                            email: email.clone(),
                            status: status.clone(),
                            selected: HashSet::new(),
                        });
                    }
                }
                3 => {
                    stack.pop();
                }
                _ => {}
            }
        }
        AppScreen::GrantPermission {
            permissions: perms,
            categories: cats,
            email: _,
            selected,
            ..
        } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let user_id = stack
                .iter()
                .rev()
                .find_map(|s| {
                    if let AppScreen::Permissions { user_id, .. } = s {
                        Some(user_id.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_default();
            if !selected.is_empty() {
                for key in selected.iter() {
                    let _ = api_client.grant_user_permission(&user_id, key).await;
                }
                stack.pop();
            } else {
                let filter = if sb_idx == 0 {
                    None
                } else {
                    cats.get(sb_idx.saturating_sub(1)).cloned()
                };
                let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                    perms.iter().filter(|p| p.category == *c).collect()
                } else {
                    perms.iter().collect()
                };
                if let Some(opt) = filtered.get(content_idx) {
                    let _ = api_client.grant_user_permission(&user_id, &opt.key).await;
                }
                stack.pop();
            }
        }
        AppScreen::RevokeCategory {
            categories: cats,
            email,
            status,
        } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let user_id_for_revoke = stack
                .iter()
                .rev()
                .find_map(|s| {
                    if let AppScreen::Permissions { user_id, .. } = s {
                        Some(user_id.as_str())
                    } else {
                        None
                    }
                })
                .unwrap_or("");
            let res = api_client.list_user_permissions(user_id_for_revoke).await?;
            let mut opts: Vec<PermissionOption> = res
                .permissions
                .iter()
                .map(permission_option_from_json)
                .collect();
            opts.sort_by(|a, b| a.category.cmp(&b.category).then_with(|| a.key.cmp(&b.key)));
            stack.pop();
            tui_state.sidebar_index = 0;
            tui_state.content_index = 0;
            stack.push(AppScreen::RevokePermission {
                permissions: opts,
                categories: cats.clone(),
                email: email.clone(),
                status: status.clone(),
                selected: HashSet::new(),
            });
        }
        AppScreen::RevokePermission {
            permissions: perms,
            categories: cats,
            selected,
            ..
        } => {
            if is_back {
                stack.pop();
                return Ok(DispatchResult::Continue);
            }
            let user_id = stack
                .iter()
                .rev()
                .find_map(|s| {
                    if let AppScreen::Permissions { user_id, .. } = s {
                        Some(user_id.clone())
                    } else {
                        None
                    }
                })
                .unwrap_or_default();
            if !selected.is_empty() {
                for key in selected.iter() {
                    let _ = api_client.revoke_user_permission(&user_id, key).await;
                }
                stack.pop();
            } else {
                let filter = cats.get(sb_idx).cloned();
                let filtered: Vec<&PermissionOption> = if let Some(ref c) = filter {
                    perms.iter().filter(|p| p.category == *c).collect()
                } else {
                    perms.iter().collect()
                };
                if let Some(opt) = filtered.get(content_idx) {
                    tui_state.sidebar_index = 1;
                    stack.push(AppScreen::ConfirmRevoke {
                        user_id,
                        key: opt.key.clone(),
                    });
                }
            }
        }
        AppScreen::ConfirmRevoke { user_id, key } => {
            if content_idx == 0 {
                let _ = api_client.revoke_user_permission(user_id, key).await;
            }
            stack.pop();
            stack.pop();
        }
        AppScreen::ConfirmDelete { user_id, .. } => {
            if content_idx == 0 {
                let _ = api_client.delete_user(user_id).await;
                stack.pop();
                stack.pop();
            } else {
                stack.pop();
            }
        }
        AppScreen::GroupsList(_) | AppScreen::ModulesList(_) | AppScreen::SessionsList(_) => {
            if is_back {
                stack.pop();
            }
        }
        AppScreen::DbOutput(_)
        | AppScreen::Help(_)
        | AppScreen::UserDetailsJson(_)
        | AppScreen::PermissionTable { .. } => {
            if is_back {
                stack.pop();
            }
        }
        AppScreen::ConfirmDbReset => {
            if content_idx == 0 {
                let dir = migrations_dir(None);
                let out = run_reset_string(database_url, &dir).await?;
                stack.pop();
                tui_state.sidebar_index = 5;
                stack.push(AppScreen::DbOutput(out));
            } else {
                stack.pop();
            }
        }
    }

    Ok(DispatchResult::Continue)
}

/// Run a DB action and return output as a string (for TUI display).
// Human: Database menu indexes align with the non-interactive `db` subcommands so the TUI shows the same operations in order.
// Agent: MATCH index 0-3 -> run_status_string run_migrate_string run_seed_string run_stats_string.

async fn run_db_action_capture(
    database_url: &str,
    index: usize,
    dir: &PathBuf,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    match index {
        0 => run_status_string(database_url).await,
        1 => run_migrate_string(database_url, dir).await,
        2 => run_seed_string(database_url, dir).await,
        3 => run_stats_string(database_url).await,
        _ => Ok(String::new()),
    }
}

async fn run_status_string(
    database_url: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Human: Compact text panel proves connectivity and gives a rough sense of whether the database already has seed users.
    // Agent: pool; SELECT 1; COUNT users; close pool; FORMAT two-line string.

    let pool = pool(database_url).await?;
    let _: (i32,) = sqlx::query_as("SELECT 1").fetch_one(&pool).await?;
    let users: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await?;
    pool.close().await;
    Ok(format!("Database: connected\nUsers:   {}", users.0))
}

async fn run_stats_string(
    database_url: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Human: Table counts help operators sanity-check a restore or seed without opening a SQL shell; all queries run in parallel for speed.
    // Agent: try_join COUNT on fixed table names; NOTE table names are literals not user input.

    let pool = pool(database_url).await?;
    // Human: Inner helper formats `SELECT COUNT(*)` for a known-safe table name chosen by this CLI, not remote users.
    // Agent: query_as dynamic format string with table identifier; FETCH_ONE i64.

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
    pool.close().await;
    Ok(format!(
        "Users:        {}\nSessions:     {}\nModules:      {}\nPermissions:  {}\nTickets:      {}\nTodos:        {}\nTime entries: {}\nLinks:        {}",
        users, sessions, modules, permissions, tickets, todos, time_entries, links
    ))
}

// Human: TUI capture path wraps the same `run_seed` implementation as the `db seed` subcommand so output stays consistent.
// Agent: AWAIT run_seed; RETURNS static "Seed complete." string.

async fn run_seed_string(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    run_seed(database_url, migrations_dir).await?;
    Ok("Seed complete.".to_string())
}

// Human: String wrapper exists so the database menu can show the same migrate result text as the CLI prints to stdout.
// Agent: AWAIT run_migrate; OK static migrations message.

async fn run_migrate_string(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    run_migrate(database_url, migrations_dir).await?;
    Ok("Migrations complete.".to_string())
}

// Human: TUI reset confirmation already happened in `AppScreen::ConfirmDbReset`, so this string helper skips prompts (`yes: true`).
// Agent: run_reset skip_confirm true; RETURNS completion string.

async fn run_reset_string(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    run_reset(database_url, migrations_dir, true).await?;
    Ok("Database reset complete.".to_string())
}

// Human: Help screen text is generated so the horizontal rule width tracks the current terminal instead of hard-wrapping at 80 columns.
// Agent: READ terminal_cols; format! multi-section static help string with APP_NAME and repeated line separators.

fn help_text() -> String {
    let w = terminal_cols();
    let line = "─".repeat(w);
    format!(
        "{} CLI Help — Command-line interface documentation\n\n{}\nAvailable command categories:\n\n  Users   User management (list, show, edit) — requires API + CLOUDWRKZ_TOKEN\n  Groups  Group management (list) — requires API + token\n  Modules Module management (list) — requires API + token\n  Sessions Session management (list) — requires API + token\n  Database Database maintenance (status, migrate, seed, stats, reset) — local DB\n\n{}\nManagement (API):\n\n  Set CLOUDWRKZ_API_URL (default: http://localhost:8080/api/v1)\n  Get a token: cloudwrkz-cli login then set CLOUDWRKZ_TOKEN\n\n{}\nExamples (non-interactive):\n\n  cloudwrkz-cli login   Log in and print token\n  cloudwrkz-cli db status   Check DB connection\n  cloudwrkz-cli db migrate   Run migrations\n  cloudwrkz-cli db seed   Seed modules & permissions\n  cloudwrkz-cli db stats   Table row counts\n  cloudwrkz-cli db reset   Reset schema + migrations (destructive)\n\n{}\nInteractive: Run cloudwrkz-cli with no arguments for the menu-driven interface.",
        APP_NAME, line, line, line, line
    )
}

// Human: When `CLOUDWRKZ_TOKEN` is missing we block with a full-screen explainer instead of failing each API call cryptically from deep menus.
// Agent: clear_screen + header; PRINT token/env instructions; wait_for_enter.

fn show_login_required() {
    clear_screen();
    header(
        "Login required",
        "Management (Users, Groups, Modules, Sessions) uses the API.",
    );
    println!(
        "{} Set {} and (optionally) {} then run again.",
        "ℹ".bright_blue(),
        "CLOUDWRKZ_TOKEN".cyan(),
        "CLOUDWRKZ_API_URL".cyan()
    );
    println!();
    println!("  {}  Get a token by logging in:", "To get a token:".bold());
    println!("     {}", "cloudwrkz-cli login".cyan());
    println!();
    println!("  Then export the token:");
    println!(
        "     {}",
        "export CLOUDWRKZ_TOKEN=\"<token from login>\"".bright_black()
    );
    println!();
    wait_for_enter();
}

// Human: CLI commands are short-lived, so a two-connection cap avoids holding a large pool during one-off scripts.
// Agent: PgPoolOptions max_connections 2 connect database_url.

async fn pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(2)
        .connect(database_url)
        .await
}

async fn run_seed(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Seeds ship as raw multi-statement SQL beside migrations so operators can diff them like any other migration artifact.
    // Agent: READ 002_seed_data.sql; raw_sql execute on acquired conn; COUNT modules+permissions; close pool.

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

    println!(
        "Seed complete. Modules: {}, Permissions: {}",
        modules.0, permissions.0
    );
    pool.close().await;
    Ok(())
}

async fn run_migrate(
    database_url: &str,
    migrations_dir: &PathBuf,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Uses the same folder layout as `sqlx migrate` so CI and devs only maintain one migrations tree under `apps/api/migrations`.
    // Agent: EXISTS check migrations_dir; Migrator::new RUN; println complete.

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

// Human: Non-interactive `db status` is the quickest smoke test that credentials reach Postgres and the `users` table is reachable.
// Agent: pool SELECT 1 + COUNT users println; pool.close.

async fn run_status(database_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pool = pool(database_url).await?;

    let _: (i32,) = sqlx::query_as("SELECT 1").fetch_one(&pool).await?;
    let users: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&pool)
        .await?;

    println!("Database: connected");
    println!("Users:   {}", users.0);
    pool.close().await;
    Ok(())
}

async fn run_stats(database_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Same parallel COUNT strategy as the TUI string variant but prints line-by-line for terminal `db stats` usage.
    // Agent: try_join eight fixed tables; println each; pool.close.

    let pool = pool(database_url).await?;

    // Human: Identical to `run_stats_string` inner helper—table names are CLI-controlled literals, not user SQL.
    // Agent: format SELECT COUNT FROM table; query_as fetch_one.

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

async fn run_reset(
    database_url: &str,
    migrations_dir: &PathBuf,
    skip_confirm: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Human: Reset is intentionally destructive: it drops `public`, recreates grants, then replays migrations so the schema matches this binary.
    // Agent: inquire Confirm unless skip_confirm; DROP SCHEMA CASCADE; CREATE SCHEMA; GRANT best-effort; run_migrate.

    if !skip_confirm {
        let confirmed = Confirm::new(
            "WARNING: Reset database will delete all data in schema public. Continue?",
        )
        .with_default(false)
        .prompt()
        .unwrap_or(false);
        if !confirmed {
            println!("Database reset cancelled.");
            return Ok(());
        }
    }

    if !migrations_dir.exists() {
        return Err(format!(
            "Migrations directory not found: {}. Set MIGRATIONS_DIR or run from repo root.",
            migrations_dir.display()
        )
        .into());
    }

    println!("Resetting database schema...");
    let pool = pool(database_url).await?;
    sqlx::query("DROP SCHEMA IF EXISTS public CASCADE;")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE SCHEMA public;").execute(&pool).await?;
    sqlx::query("GRANT ALL ON SCHEMA public TO postgres;")
        .execute(&pool)
        .await
        .ok();
    sqlx::query("GRANT ALL ON SCHEMA public TO public;")
        .execute(&pool)
        .await
        .ok();
    pool.close().await;

    run_migrate(database_url, migrations_dir).await?;
    println!("Database reset complete.");
    Ok(())
}

// Human: TUI “verify email” bypasses the mailer and simply flips the flag for operators fixing stuck onboarding in dev environments.
// Agent: UPDATE users SET email_verified true WHERE id bind; pool.close.

async fn run_verify_email(
    database_url: &str,
    user_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pool = pool(database_url).await?;
    sqlx::query("UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await?;
    pool.close().await;
    Ok(())
}
