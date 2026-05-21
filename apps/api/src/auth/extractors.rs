//! Axum extractors that turn `Authorization: Bearer` or `session=` cookies into a validated [`CurrentUser`].

// Human: Authenticated routes use `AuthUser` so handlers do not duplicate bearer-vs-cookie parsing or session expiry checks.
// Agent: FromRequestParts READS headers; CALLS validate_session on PgPool; RETURNS 401 AppError on missing/invalid/expired/inactive user; SLIDING extend on activity.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use chrono::Utc;
use sqlx::Row;

use crate::auth::session_activity::{
    SessionPolicy, apply_activity_extension, invalidate_if_absolute_expired,
    is_past_absolute_max,
};
use crate::error::AppError;
use crate::models::user::CurrentUser;
use crate::routes::AppState;

#[derive(Debug, Clone)]
pub struct AuthUser(pub CurrentUser);

// Human: Browser clients may send either a bearer API token or the `session` cookie set by the login response, whichever is present first.
// Agent: extract_bearer_token OR extract_cookie_token; validate_session; REJECTION unauthorized missing token or DB/session rules.

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer_token(parts)
            .or_else(|| extract_cookie_token(parts))
            .ok_or_else(|| AppError::unauthorized("Missing authentication token"))?;

        let policy = SessionPolicy::from_config(&state.config);
        let user = validate_session(&state.pool, &token, &policy).await?;
        Ok(AuthUser(user))
    }
}

// Human: Parses a standard `Bearer` prefix case-sensitively so accidental `bearer` typos do not authenticate.
// Agent: READS authorization header UTF-8; STRIPS prefix Bearer ; TRIMS token.

fn extract_bearer_token(parts: &Parts) -> Option<String> {
    let auth = parts.headers.get("authorization")?.to_str().ok()?;
    auth.strip_prefix("Bearer ").map(|t| t.trim().to_string())
}

// Human: Cookie auth walks the raw `Cookie` header because Axum does not assume a cookie jar for API-style clients.
// Agent: READS cookie header; SPLITS on ; ; FINDS session= value; RETURNS first match.

fn extract_cookie_token(parts: &Parts) -> Option<String> {
    let cookies = parts.headers.get("cookie")?.to_str().ok()?;
    for cookie in cookies.split(';') {
        let cookie = cookie.trim();
        if let Some(value) = cookie.strip_prefix("session=") {
            return Some(value.to_string());
        }
    }
    None
}

// Human: Sessions must exist, respect idle and absolute expiry, and belong to an active verified user; activity slides idle expiry up to the creation cap.
// Agent: SELECT sessions JOIN users; CHECK absolute max + expires_at; CALL apply_activity_extension; REJECT inactive users.

async fn validate_session(
    pool: &sqlx::PgPool,
    token: &str,
    policy: &SessionPolicy,
) -> Result<CurrentUser, AppError> {
    let row = sqlx::query(
        r#"SELECT s.id as session_id, s.expires_at, s.created_at,
                  u.id as user_id, u.email, u.name,
                  u.role::text as role, u.status::text as status,
                  u.email_verified, u.timezone, u.theme, u.avatar
           FROM sessions s
           JOIN users u ON s.user_id = u.id
           WHERE s.token = $1"#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|_| AppError::internal("Failed to validate session"))?
    .ok_or_else(|| AppError::unauthorized("Invalid or expired session"))?;

    let session_id: String = row.get("session_id");
    let expires_at: chrono::NaiveDateTime = row.get("expires_at");
    let created_at: chrono::NaiveDateTime = row.get("created_at");
    let now = Utc::now().naive_utc();

    if is_past_absolute_max(now, created_at, policy) {
        let _ = invalidate_if_absolute_expired(pool, &session_id, created_at, policy).await;
        return Err(AppError::unauthorized("Session expired"));
    }

    if expires_at < now {
        return Err(AppError::unauthorized("Session expired"));
    }

    let status: String = row.get("status");
    let email_verified: bool = row.get("email_verified");

    if status == "DELETED" || status != "ACTIVE" || !email_verified {
        return Err(AppError::unauthorized("Account not active"));
    }

    let _ = apply_activity_extension(pool, &session_id, created_at, expires_at, policy)
        .await
        .map_err(|_| AppError::internal("Failed to extend session"))?;

    Ok(CurrentUser {
        id: row.get("user_id"),
        email: row.get("email"),
        name: row.get("name"),
        role: row.get("role"),
        status,
        email_verified,
        timezone: row
            .try_get::<Option<String>, _>("timezone")
            .ok()
            .flatten()
            .unwrap_or_else(|| "UTC".to_string()),
        theme: row
            .try_get::<Option<String>, _>("theme")
            .ok()
            .flatten()
            .unwrap_or_else(|| "system".to_string()),
        avatar: row.try_get("avatar").ok().flatten(),
    })
}

// Human: Handlers outside `AuthUser` still need the same token source the extractor uses so logout and session management stay consistent.
// Agent: READS Authorization Bearer OR Cookie session=; TRIMS; RETURNS Option<String>.

pub fn extract_token_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    extract_bearer_from_headers(headers).or_else(|| extract_cookie_from_headers(headers))
}

fn extract_bearer_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let auth = headers.get("authorization")?.to_str().ok()?;
    auth.strip_prefix("Bearer ").map(|t| t.trim().to_string())
}

fn extract_cookie_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let cookies = headers.get("cookie")?.to_str().ok()?;
    for cookie in cookies.split(';') {
        let cookie = cookie.trim();
        if let Some(value) = cookie.strip_prefix("session=") {
            return Some(value.to_string());
        }
    }
    None
}
