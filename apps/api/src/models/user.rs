use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub status: String,
    pub email_verified: bool,
    pub timezone: String,
    pub theme: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub password: String,
    pub role: String,
    pub status: String,
    pub email_verified: bool,
    pub timezone: String,
    pub theme: String,
    pub locale: String,
    pub avatar: Option<String>,
    pub bio: Option<String>,
    pub last_login_at: Option<chrono::NaiveDateTime>,
    pub last_login_ip: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub remember_me: bool,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub device_os: Option<String>,
    pub device_browser: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: LoginUserInfo,
}

#[derive(Debug, Serialize)]
pub struct LoginUserInfo {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub confirm_password: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
    #[serde(default)]
    pub confirm_password: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub name: Option<String>,
    pub email: String,
    pub modules: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct UserSummary {
    pub id: String,
    pub name: Option<String>,
    pub email: String,
    pub status: String,
}
