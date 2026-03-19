//! Stored diagnostics token (argon2 hash in `system_settings`) and optional env override.
//! Used to authorize `GET …/health/detailed`.

use argon2::password_hash::rand_core::{OsRng, RngCore};
use sqlx::PgPool;

use crate::auth::password;

const SETTINGS_KEY: &str = "diagnostics_health_token_hash";

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
pub fn generate_raw_token() -> String {
    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);
    let suffix: String = raw.iter().map(|b| format!("{:02x}", b)).collect();
    format!("cwzd_{suffix}")
}

pub async fn fetch_stored_hash(pool: &PgPool) -> Option<String> {
    let row: Option<String> = sqlx::query_scalar(
        r#"SELECT value #>> '{}' FROM system_settings WHERE key = $1 LIMIT 1"#,
    )
    .bind(SETTINGS_KEY)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    row.filter(|s| !s.is_empty())
}

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
pub async fn has_database_token(pool: &PgPool) -> bool {
    fetch_stored_hash(pool).await.is_some()
}

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
