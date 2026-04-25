//! Stored diagnostics token (argon2 hash in `system_settings`) and optional env override.
//! Used to authorize `GET …/health/detailed`.

// Human: This module keeps detailed health checks behind a secret that lives in the DB (or env) so unauthenticated callers cannot scrape internals.
// Agent: READS system_settings diagnostics_health_token_hash; WRITES hash via INSERT ON CONFLICT; COMPARES Bearer via constant-time or argon2 verify.

use argon2::password_hash::rand_core::{OsRng, RngCore};
use sqlx::PgPool;

use crate::auth::password;

const SETTINGS_KEY: &str = "diagnostics_health_token_hash";

// Human: String equality runs in constant time so timing does not leak how much of the env token matched before failure.
// Agent: XOR-accumulates byte differences; RETURNS false on length mismatch; NO short-circuit on first differing byte.

fn ct_eq_str(a: &str, b: &str) -> bool {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    if ab.len() != bb.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in ab.iter().zip(bb.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Random secret shown once to the admin or CLI; store as `Authorization: Bearer …` for detailed health.
// Human: The `cwzd_` prefix plus 32 random bytes hex-encoded gives a single-line secret that is easy to spot in config dumps.
// Agent: READS OsRng 32 bytes; FORMATS hex; PREFIX cwzd_; WRITES nothing until caller persists hash.

pub fn generate_raw_token() -> String {
    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);
    let suffix: String = raw.iter().map(|b| format!("{:02x}", b)).collect();
    format!("cwzd_{suffix}")
}

// Human: Loads the persisted PHC string from JSON `system_settings` so the API can verify Bearer tokens without holding plaintext in config.
// Agent: SELECT value #>> '{}' FROM system_settings WHERE key diagnostics_health_token_hash; IGNORES sqlx Err (maps to None); FILTERS empty.

pub async fn fetch_stored_hash(pool: &PgPool) -> Option<String> {
    let row: Option<String> =
        sqlx::query_scalar(r#"SELECT value #>> '{}' FROM system_settings WHERE key = $1 LIMIT 1"#)
            .bind(SETTINGS_KEY)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
    row.filter(|s| !s.is_empty())
}

// Human: Upserts the hashed token so rotation replaces the old row atomically for every replica reading the same table.
// Agent: INSERT system_settings ON CONFLICT UPDATE value updated_at; BINDS SETTINGS_KEY + json!(phc); RETURNS sqlx::Error on failure.

pub async fn set_stored_hash(pool: &PgPool, phc: &str) -> Result<(), sqlx::Error> {
    let value = serde_json::json!(phc);
    sqlx::query(
        r#"INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
    )
    .bind(SETTINGS_KEY)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

/// True if the DB has a non-empty stored hash.
// Human: CLI and admin flows use this to decide whether generating a token will overwrite an existing secret.
// Agent: CALLS fetch_stored_hash; RETURNS is_some.

pub async fn has_database_token(pool: &PgPool) -> bool {
    fetch_stored_hash(pool).await.is_some()
}

// Human: Env plaintext wins first (ops emergency access), then we fall back to verifying the stored Argon2 hash of the same Bearer value.
// Agent: READS env_plaintext optional ct_eq_str; ELSE READS system_settings hash; CALLS password::verify_password; RETURNS bool.

pub async fn validate_presented_token(
    pool: &PgPool,
    env_plaintext: Option<&str>,
    presented: &str,
) -> bool {
    let presented = presented.trim();
    if presented.is_empty() {
        return false;
    }
    if let Some(env_t) = env_plaintext {
        let env_t = env_t.trim();
        if !env_t.is_empty() && ct_eq_str(presented, env_t) {
            return true;
        }
    }
    if let Some(hash) = fetch_stored_hash(pool).await {
        return password::verify_password(presented, &hash).unwrap_or(false);
    }
    false
}

/// CLI: `cloudwrkz-api diagnostics-token generate` — requires `DATABASE_URL`, runs migrations, prints token once.
// Human: The subcommand connects, migrates, hashes the new secret once, persists it, and prints the raw token exactly once for the operator to save.
// Agent: CALLS create_pool + migrate; CALLS hash_password + set_stored_hash; STDOUT raw token; EXITS 1 on any failure path.

pub async fn cli_generate(database_url: &str) {
    let pool = match crate::db::create_pool(database_url).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to connect to database: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
        eprintln!("Failed to run migrations: {e}");
        std::process::exit(1);
    }

    let raw = generate_raw_token();
    let hash = match password::hash_password(&raw) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Failed to hash token: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = set_stored_hash(&pool, &hash).await {
        eprintln!("Failed to save token hash: {e}");
        std::process::exit(1);
    }

    println!("{raw}");
    eprintln!(
        "Diagnostics token generated. Use: curl -H \"Authorization: Bearer {raw}\" …/api/v1/health/detailed"
    );
    eprintln!("This is the only time the plaintext token is printed.");
}
