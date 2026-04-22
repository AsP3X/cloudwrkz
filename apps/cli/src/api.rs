//! API client for CloudWrkz backend. Used for User, Group, Module, Session management in interactive mode.

// Human: Thin reqwest wrapper around `/api/v1` admin and auth endpoints so the CLI matches the same JSON contracts as the web app.
// Agent: READS CLOUDWRKZ_API_URL + CLOUDWRKZ_TOKEN; POST auth/login with 202 polling; GET/PATCH/DELETE admin/* with Bearer when needed.

use serde::Deserialize;

// Human: When `CLOUDWRKZ_API_URL` is unset, operators only need `API_PORT` from the API’s `.env`—the CLI assumes localhost and `/api/v1`.
// Agent: READS CLOUDWRKZ_API_URL trim strip trailing slash; ELSE READS API_PORT default 8080; RETURNS http://127.0.0.1:{port}/api/v1.

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
// Human: Interactive menus need both where to call and whether `Authorization` can be attached without prompting every screen.
// Agent: CALLS default_api_url; READS CLOUDWRKZ_TOKEN trim non-empty; RETURNS (base, Some(token)).

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
    // Human: One client instance is reused for a whole TUI session so connection pooling and cookies behave like a single browser tab.
    // Agent: STORES reqwest::Client + normalized base_url + optional token; NO cookie jar beyond defaults.

    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    // Human: Callers pass paths like `admin/users` without a leading slash so concatenation cannot produce double slashes.
    // Agent: TRIM leading / on path; FORMAT {base_url}/{path}.

    fn url(&self, path: &str) -> String {
        let path = path.trim_start_matches('/');
        format!("{}/{}", self.base_url, path)
    }

    // Human: Only authenticated admin routes get a Bearer header; login itself stays unauthenticated.
    // Agent: MAPS token Some -> `Bearer {token}` string.

    fn auth_header(&self) -> Option<String> {
        self.token.as_deref().map(|t| format!("Bearer {}", t))
    }

    pub fn has_token(&self) -> bool {
        self.token.is_some()
    }

    /// POST /auth/login (API returns 202; polls until completed or failed)
    // Human: The API may queue login when Postgres is busy, so 202 must be followed by the job status URL instead of treating it as success.
    // Agent: POST auth/login JSON; ON 202 DESERIALIZE job_id CALL poll_login_until_done; ON 2xx ELSE parse LoginResponse; ON failure READ body text Http err.

    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResponse, ApiError> {
        let body = serde_json::json!({ "email": email, "password": password });
        let res = self
            .client
            .post(self.url("auth/login"))
            .json(&body)
            .send()
            .await?;
        let status = res.status();
        if status.as_u16() == 202 {
            let accepted: LoginAcceptedResponse = res.json().await?;
            return self
                .poll_login_until_done(&accepted.job_id, accepted.retry_deadline_secs.unwrap_or(30))
                .await;
        }
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(ApiError::Http(status.as_u16(), text));
        }
        let out: LoginResponse = res.json().await?;
        Ok(out)
    }

    // Human: Mirrors the browser login banner behavior—poll every ~800ms until completed, failed, or deadline so scripts do not hang forever.
    // Agent: LOOP GET auth/login/status/{job_id}; PARSE LoginJobStatusBody; completed RETURNS token+user; failed MAPS BANNED hint to 403; TIMEOUT 408.

    async fn poll_login_until_done(
        &self,
        job_id: &str,
        retry_secs: u32,
    ) -> Result<LoginResponse, ApiError> {
        use std::time::{Duration, Instant};
        let max_wait = Duration::from_secs(u64::from(retry_secs.saturating_add(10)));
        let start = Instant::now();
        loop {
            if start.elapsed() > max_wait {
                return Err(ApiError::Http(
                    408,
                    "Sign-in timed out waiting for the server to finish processing.".into(),
                ));
            }
            let res = self
                .client
                .get(self.url(&format!("auth/login/status/{job_id}")))
                .send()
                .await?;
            if res.status() == reqwest::StatusCode::NOT_FOUND {
                return Err(ApiError::Http(404, "Login job expired or unknown.".into()));
            }
            if !res.status().is_success() {
                let code = res.status().as_u16();
                let text = res.text().await.unwrap_or_default();
                return Err(ApiError::Http(code, text));
            }
            let st: LoginJobStatusBody = res.json().await?;
            match st.status.as_str() {
                "completed" => {
                    let token = st.token.ok_or_else(|| {
                        ApiError::Http(500, "Login completed but token missing".into())
                    })?;
                    let user = st.user.ok_or_else(|| {
                        ApiError::Http(500, "Login completed but user missing".into())
                    })?;
                    return Ok(LoginResponse { token, user });
                }
                "failed" => {
                    let msg = st.message.unwrap_or_else(|| "Sign-in failed".into());
                    let code = if st.client_hint.as_deref() == Some("BANNED") {
                        403
                    } else {
                        401
                    };
                    return Err(ApiError::Http(code, msg));
                }
                _ => {
                    tokio::time::sleep(Duration::from_millis(800)).await;
                }
            }
        }
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
            body.insert(
                "status".to_string(),
                serde_json::Value::String(s.to_string()),
            );
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
    pub async fn list_user_permissions(
        &self,
        user_id: &str,
    ) -> Result<UserPermissionsResponse, ApiError> {
        self.get(&format!("admin/users/{}/permissions", user_id))
            .await
    }

    /// POST /admin/users/:id/permissions (body: { "key": "tickets.view" })
    // Human: Grant uses POST with a JSON body unlike GET list helpers, so it cannot share the generic `get` path.
    // Agent: POST admin/users/{id}/permissions json {key}; SET Bearer; MAP non-success to Http with body text.

    pub async fn grant_user_permission(&self, user_id: &str, key: &str) -> Result<(), ApiError> {
        let body = serde_json::json!({ "key": key });
        let mut req = self
            .client
            .post(self.url(&format!("admin/users/{}/permissions", user_id)))
            .json(&body);
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

    // Human: Admin PATCH endpoints share one helper so every mutating call consistently attaches Bearer and surfaces HTTP bodies on failure.
    // Agent: BUILD reqwest patch + JSON body; SET Authorization if token; RETURN Err Http on !is_success.

    async fn patch(
        &self,
        path: &str,
        body: serde_json::Map<String, serde_json::Value>,
    ) -> Result<(), ApiError> {
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

    // Human: DELETE helpers mirror PATCH: same auth header rules and same error mapping for permission denials.
    // Agent: DELETE url(path); SET Authorization; ERR Http on non-success.

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

    // Human: Typed GETs deserialize JSON straight into structs used by the TUI lists; failures keep the raw body for debugging.
    // Agent: GET url(path); SET Authorization; res.json on success ELSE Http with text body.

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
// Human: Operators often misconfigure only the port or forget to start the API—this expands transport errors with concrete next steps.
// Agent: Http ERR passthrough; Reqwest NO status APPENDS multi-line hint with api_base + cargo run + CLOUDWRKZ_API_URL note + timeout suffix.

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
struct LoginAcceptedResponse {
    job_id: String,
    retry_deadline_secs: Option<u32>,
}

#[derive(Deserialize)]
struct LoginJobStatusBody {
    status: String,
    token: Option<String>,
    user: Option<LoginUserInfo>,
    message: Option<String>,
    client_hint: Option<String>,
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
