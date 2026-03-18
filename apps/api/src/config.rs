use std::env;

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
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
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
