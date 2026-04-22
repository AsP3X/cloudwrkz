//! Axum extractors that turn `Authorization: Bearer` or `session=` cookies into a validated [`CurrentUser`].

// Human: Authenticated routes use `AuthUser` so handlers do not duplicate bearer-vs-cookie parsing or session expiry checks.
// Agent: FromRequestParts READS headers; CALLS validate_session on PgPool; RETURNS 401 AppError on missing/invalid/expired/inactive user.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sqlx::Row;

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

        let user = validate_session(&state.pool, &token).await?;
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

// Human: Sessions must exist, not be expired, and belong to an active verified user before any protected handler runs.
// Agent: SELECT sessions JOIN users WHERE token; CHECK expires_at naive_utc; REJECT DELETED/non-ACTIVE/unverified; MAPS CurrentUser defaults timezone/theme.

async fn validate_session(pool: &sqlx::PgPool, token: &str) -> Result<CurrentUser, AppError> {
    let row = sqlx::query(
        r#"SELECT s.id as session_id, s.expires_at,
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

    let expires_at: chrono::NaiveDateTime = row.get("expires_at");
    if expires_at < chrono::Utc::now().naive_utc() {
        return Err(AppError::unauthorized("Session expired"));
    }

    let status: String = row.get("status");
    let email_verified: bool = row.get("email_verified");

    if status == "DELETED" || status != "ACTIVE" || !email_verified {
        return Err(AppError::unauthorized("Account not active"));
    }

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

/// Extract the raw bearer token from a request's headers (for use outside the extractor).
// Human: Some flows (logout, token refresh helpers) need the bearer string without building a full `AuthUser` extractor context.
// Agent: READS Authorization header; STRIPS Bearer ; TRIMS; RETURNS Option same as extract_bearer_token logic.

pub fn extract_token_from_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let auth = headers.get("authorization")?.to_str().ok()?;
    auth.strip_prefix("Bearer ").map(|t| t.trim().to_string())
}
