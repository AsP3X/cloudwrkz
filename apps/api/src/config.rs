use std::env;
use std::time::Duration;

fn env_u64_compat(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

#[derive(Debug, Clone, Default)]
pub struct DeploymentCliOverrides {
    pub region: Option<String>,
    pub api_nodes_available: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub api_host: String,
    pub api_port: u16,
    pub cors_origins: Vec<String>,
    pub cookie_domain: Option<String>,
    pub cookie_secure: bool,
    pub session_max_age_secs: i64,
    pub max_body_size: usize,
    /// Logical region for this API instance (global routing / status). `API_REGION` or `--region`.
    pub api_region: Option<String>,
    /// How many API nodes this deployment reports as available (single-process = 1 until multi-endpoint).
    pub api_nodes_available: u32,
    /// Optional plaintext override for `GET …/health/detailed` (use rotation via admin/CLI + DB hash in production).
    pub diagnostics_health_token: Option<String>,
    /// Time between adding one token to the per-IP bucket for `/api/v1/auth/*` (sustained ≈ 60/refill_secs per minute).
    pub auth_rate_limit_refill_period: Duration,
    /// Max burst of auth requests per IP before shedding (429).
    pub auth_rate_limit_burst: u32,
    /// Wall-clock cap for each queued mutation future (tokio timeout).
    pub mutation_tx_max_ms: u64,
    /// PostgreSQL `SET LOCAL lock_timeout` for mutation transactions (wait to acquire row lock).
    pub mutation_lock_timeout_ms: u64,
    /// PostgreSQL `SET LOCAL statement_timeout` per mutation transaction.
    pub mutation_statement_timeout_ms: u64,
    /// Bounded mpsc capacity per shard (backpressure when full).
    pub mutation_queue_capacity: usize,
    pub idempotency_max_entries: usize,
    pub idempotency_ttl_secs: u64,
    /// Optional `GITHUB_TOKEN` / `GITHUB_API_TOKEN` for GitHub REST (higher rate limits; no in-process hourly cap).
    pub github_api_token: Option<String>,
    /// Max anonymous GitHub REST requests per rolling hour for this process (GitHub allows 60/hour per IP without auth).
    pub github_anonymous_max_requests_per_hour: u32,
    /// Max concurrent `github_link_metadata` jobs the global worker will run (each job still rate-limits HTTP internally).
    pub job_queue_github_max_concurrent: u32,
    /// Optional minimum seconds between *starting* two `github_link_metadata` jobs (pacing on top of concurrency).
    pub job_queue_github_min_start_interval_secs: Option<u64>,
    /// Public web app origin for QR payloads (e.g. `https://app.example.com`). If unset, `Host` / `X-Forwarded-*` from the API request is used (may point at the API host).
    pub public_web_app_url: Option<String>,
    /// When false, skip inserts into `http_request_logs` (useful for noisy tests).
    pub http_request_log_enabled: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            api_host: env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            api_port: env::var("API_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            cors_origins: env::var("CORS_ORIGINS")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            cookie_domain: env::var("COOKIE_DOMAIN").ok(),
            cookie_secure: env::var("COOKIE_SECURE")
                .map(|v| v == "true")
                .unwrap_or(false),
            session_max_age_secs: env::var("SESSION_MAX_AGE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7 * 24 * 60 * 60), // 7 days
            max_body_size: env::var("MAX_BODY_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10 * 1024 * 1024), // 10 MB
            api_region: env::var("API_REGION")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            api_nodes_available: env::var("API_NODES_AVAILABLE")
                .ok()
                .and_then(|s| s.parse::<u32>().ok())
                .filter(|&n| n >= 1)
                .unwrap_or(1),
            diagnostics_health_token: env::var("DIAGNOSTICS_HEALTH_TOKEN")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            auth_rate_limit_refill_period: {
                let per_minute: u32 = env::var("AUTH_RATE_LIMIT_PER_MINUTE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(60)
                    .clamp(6, 600);
                let period_ms = (60_000u64 / u64::from(per_minute)).max(1);
                Duration::from_millis(period_ms)
            },
            auth_rate_limit_burst: env::var("AUTH_RATE_LIMIT_BURST")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(30)
                .clamp(1, 300),
            mutation_tx_max_ms: env_u64_compat("COMMAND_DB_TX_MAX_MS", 30_000)
                .clamp(1_000, 600_000),
            mutation_lock_timeout_ms: env_u64_compat("COMMAND_DB_LOCK_TIMEOUT_MS", 8_000)
                .clamp(100, 120_000),
            mutation_statement_timeout_ms: env_u64_compat(
                "COMMAND_DB_STATEMENT_TIMEOUT_MS",
                25_000,
            )
            .clamp(100, 600_000),
            mutation_queue_capacity: env_u64_compat("MUTATION_QUEUE_CAPACITY", 1024)
                .clamp(8, 65_536) as usize,
            idempotency_max_entries: env_u64_compat("IDEMPOTENCY_MAX_ENTRIES", 4096)
                .clamp(64, 1_000_000) as usize,
            idempotency_ttl_secs: env_u64_compat("IDEMPOTENCY_TTL_SECS", 86_400).clamp(60, 604_800),
            github_api_token: env::var("GITHUB_TOKEN")
                .or_else(|_| env::var("GITHUB_API_TOKEN"))
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            github_anonymous_max_requests_per_hour: env::var(
                "GITHUB_ANONYMOUS_MAX_REQUESTS_PER_HOUR",
            )
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(60)
            .clamp(1, 100_000),
            job_queue_github_max_concurrent: std::env::var("JOB_QUEUE_GITHUB_MAX_CONCURRENT")
                .ok()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(1)
                .clamp(1, 32),
            job_queue_github_min_start_interval_secs: std::env::var(
                "JOB_QUEUE_GITHUB_MIN_START_INTERVAL_SECS",
            )
            .ok()
            .and_then(|s| {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    t.parse::<u64>().ok()
                }
            })
            .map(|secs| secs.clamp(1, 86_400)),
            public_web_app_url: env::var("PUBLIC_WEB_APP_URL")
                .ok()
                .map(|s| s.trim().trim_end_matches('/').to_string())
                .filter(|s| !s.is_empty()),
            http_request_log_enabled: env::var("HTTP_REQUEST_LOG_ENABLED")
                .ok()
                .map(|s| {
                    let t = s.trim();
                    if t.is_empty() {
                        return true;
                    }
                    let t = t.to_ascii_lowercase();
                    !(t == "0" || t == "false" || t == "no")
                })
                .unwrap_or(true),
        }
    }

    /// Apply `--region` / `--api-nodes` from argv (CLI wins over env for provided flags).
    pub fn apply_deployment_cli(&mut self, cli: DeploymentCliOverrides) {
        if let Some(r) = cli.region {
            let t = r.trim();
            if t.is_empty() {
                self.api_region = None;
            } else {
                self.api_region = Some(t.to_string());
            }
        }
        if let Some(n) = cli.api_nodes_available {
            self.api_nodes_available = n.max(1);
        }
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.api_host, self.api_port)
    }

    pub fn cookie_domain(&self) -> Option<&str> {
        self.cookie_domain.as_deref()
    }

    pub fn cookie_secure(&self) -> bool {
        self.cookie_secure
    }
}

/// Parse deployment flags from process args (after binary name). Skips `-v` / `--verbose` and their value.
pub fn parse_deployment_cli_from_args() -> DeploymentCliOverrides {
    let mut out = DeploymentCliOverrides::default();
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "-h" || arg == "--help" {
            continue;
        }
        if arg == "-v" || arg == "--verbose" {
            let _ = args.next();
            continue;
        }
        if arg == "--region" {
            if let Some(v) = args.next() {
                if !v.starts_with('-') {
                    out.region = Some(v);
                }
            }
            continue;
        }
        if let Some(rest) = arg.strip_prefix("--region=") {
            if !rest.is_empty() {
                out.region = Some(rest.to_string());
            }
            continue;
        }
        if arg == "--api-nodes" {
            if let Some(v) = args.next() {
                if !v.starts_with('-') {
                    if let Ok(n) = v.parse::<u32>() {
                        out.api_nodes_available = Some(n);
                    }
                }
            }
            continue;
        }
        if let Some(rest) = arg.strip_prefix("--api-nodes=") {
            if let Ok(n) = rest.parse::<u32>() {
                out.api_nodes_available = Some(n);
            }
            continue;
        }
    }
    out
}
