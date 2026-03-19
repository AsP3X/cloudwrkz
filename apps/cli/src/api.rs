//! API client for CloudWrkz backend. Used for User, Group, Module, Session management in interactive mode.

use serde::Deserialize;

fn default_api_url() -> String {
    if let Ok(url) = std::env::var("CLOUDWRKZ_API_URL") {
        let t = url.trim();
        if !t.is_empty() {
            return t.trim_end_matches('/').to_string();
        }
    }
    // Same source as cloudwrkz-api: API_PORT in apps/api/.env (loaded by CLI before this runs).
    let port = std::env::var("API_PORT")
        .ok()
        .and_then(|p| p.trim().parse::<u16>().ok())
        .unwrap_or(8080);
    format!("http://127.0.0.1:{port}/api/v1")
}

/// Build API base URL and optional token from env.
pub fn api_config() -> (String, Option<String>) {
    let base = default_api_url();
    let token = std::env::var("CLOUDWRKZ_TOKEN")
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    (base, token)
}

#[derive(Clone)]
pub struct ApiClient {
    client: reqwest::Client,
    base_url: String,
    token: Option<String>,
}

impl ApiClient {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    fn url(&self, path: &str) -> String {
        let path = path.trim_start_matches('/');
        format!("{}/{}", self.base_url, path)
    }

    fn auth_header(&self) -> Option<String> {
        self.token.as_deref().map(|t| format!("Bearer {}", t))
    }

    pub fn has_token(&self) -> bool {
        self.token.is_some()
    }

    /// POST /auth/login
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResponse, ApiError> {
        let body = serde_json::json!({ "email": email, "password": password });
        let res = self
            .client
            .post(self.url("auth/login"))
            .json(&body)
            .send()
            .await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        let out: LoginResponse = res.json().await?;
        Ok(out)
    }

    /// GET /admin/users
    pub async fn list_users(&self) -> Result<UserListResponse, ApiError> {
        self.get("admin/users").await
    }

    /// GET /admin/users/:id
    pub async fn get_user(&self, id: &str) -> Result<serde_json::Value, ApiError> {
        let v: serde_json::Value = self.get(&format!("admin/users/{}", id)).await?;
        Ok(v)
    }

    /// PATCH /admin/users/:id (name, role, status optional)
    pub async fn update_user(
        &self,
        id: &str,
        name: Option<&str>,
        role: Option<&str>,
        status: Option<&str>,
    ) -> Result<(), ApiError> {
        let mut body = serde_json::Map::new();
        if let Some(n) = name {
            body.insert("name".to_string(), serde_json::Value::String(n.to_string()));
        }
        if let Some(r) = role {
            body.insert("role".to_string(), serde_json::Value::String(r.to_string()));
        }
        if let Some(s) = status {
            body.insert("status".to_string(), serde_json::Value::String(s.to_string()));
        }
        self.patch(&format!("admin/users/{}", id), body).await
    }

    /// DELETE /admin/users/:id (soft delete)
    pub async fn delete_user(&self, id: &str) -> Result<(), ApiError> {
        self.delete(&format!("admin/users/{}", id)).await
    }

    /// GET /admin/permissions
    pub async fn list_permissions(&self) -> Result<PermissionListResponse, ApiError> {
        self.get("admin/permissions").await
    }

    /// GET /admin/users/:id/permissions (direct grants only)
    pub async fn list_user_permissions(&self, user_id: &str) -> Result<UserPermissionsResponse, ApiError> {
        self.get(&format!("admin/users/{}/permissions", user_id)).await
    }

    /// POST /admin/users/:id/permissions (body: { "key": "tickets.view" })
    pub async fn grant_user_permission(&self, user_id: &str, key: &str) -> Result<(), ApiError> {
        let body = serde_json::json!({ "key": key });
        let mut req = self.client.post(self.url(&format!("admin/users/{}/permissions", user_id))).json(&body);
        if let Some(h) = self.auth_header() {
            req = req.header("Authorization", h);
        }
        let res = req.send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        Ok(())
    }

    /// DELETE /admin/users/:id/permissions/:key
    pub async fn revoke_user_permission(&self, user_id: &str, key: &str) -> Result<(), ApiError> {
        let path = format!("admin/users/{}/permissions/{}", user_id, key);
        self.delete(&path).await
    }

    async fn patch(&self, path: &str, body: serde_json::Map<String, serde_json::Value>) -> Result<(), ApiError> {
        let mut req = self.client.patch(self.url(path)).json(&body);
        if let Some(h) = self.auth_header() {
            req = req.header("Authorization", h);
        }
        let res = req.send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        Ok(())
    }

    async fn delete(&self, path: &str) -> Result<(), ApiError> {
        let mut req = self.client.delete(self.url(path));
        if let Some(h) = self.auth_header() {
            req = req.header("Authorization", h);
        }
        let res = req.send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        Ok(())
    }

    /// GET /admin/groups
    pub async fn list_groups(&self) -> Result<GroupListResponse, ApiError> {
        self.get("admin/groups").await
    }

    /// GET /admin/modules
    pub async fn list_modules(&self) -> Result<ModuleListResponse, ApiError> {
        self.get("admin/modules").await
    }

    /// GET /admin/sessions
    pub async fn list_sessions(&self) -> Result<SessionListResponse, ApiError> {
        self.get("admin/sessions").await
    }

    async fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, ApiError> {
        let mut req = self.client.get(self.url(path));
        if let Some(h) = self.auth_header() {
            req = req.header("Authorization", h);
        }
        let res = req.send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        let out = res.json().await?;
        Ok(out)
    }
}

#[derive(Debug)]
pub enum ApiError {
    Reqwest(reqwest::Error),
    Http(u16, String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::Reqwest(e) => write!(f, "{}", e),
            ApiError::Http(code, body) => write!(f, "HTTP {}: {}", code, body),
        }
    }
}

impl std::error::Error for ApiError {}

impl From<reqwest::Error> for ApiError {
    fn from(e: reqwest::Error) -> Self {
        ApiError::Reqwest(e)
    }
}

/// Human-friendly message for CLI output (connection hints, current base URL).
pub fn user_message(err: &ApiError, api_base: &str) -> String {
    match err {
        ApiError::Http(code, body) => {
            format!("HTTP {}: {}", code, body)
        }
        ApiError::Reqwest(e) => {
            let mut out = e.to_string();
            // Prefer `status().is_none()` over `is_connect()`: on some platforms (e.g. Windows)
            // refused connections aren't always classified as connect errors.
            if e.status().is_none() {
                out.push_str(&format!(
                    "\n\nNo HTTP response from the server (network or connection error).\n\
                     Configured API base: {api_base}\n\n\
                     • Start the API from the repo root: cargo run -p cloudwrkz-api\n\
                     • Or set CLOUDWRKZ_API_URL (must include /api/v1).\n\
                     • If CLOUDWRKZ_API_URL is unset, the CLI uses API_PORT from apps/api/.env (default 8080).\n\
                     • If the API is running, confirm the port matches API_PORT / CLOUDWRKZ_API_URL."
                ));
                if e.is_timeout() {
                    out.push_str("\n  (This failure was reported as a timeout.)");
                }
            }
            out
        }
    }
}

#[derive(Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: LoginUserInfo,
}

#[derive(Deserialize)]
pub struct LoginUserInfo {
    pub email: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct UserListResponse {
    pub users: Vec<serde_json::Value>,
    pub total: i64,
}

#[derive(Deserialize)]
pub struct GroupListResponse {
    pub groups: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct ModuleListResponse {
    pub modules: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct SessionListResponse {
    pub sessions: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct PermissionListResponse {
    pub permissions: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct UserPermissionsResponse {
    pub permissions: Vec<serde_json::Value>,
}
