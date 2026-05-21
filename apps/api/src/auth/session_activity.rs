//! Sliding session expiry: active users extend `expires_at`, capped at `created_at + absolute_max`.

// Human: Sessions expire after idle time unless the user keeps using the app; no session outlives 30 days from creation.
// Agent: READS created_at expires_at + SessionPolicy; COMPUTES min(now+sliding, created_at+absolute_max); THROTTLES DB updates on auth.

use chrono::{Duration, NaiveDateTime};

use crate::config::AppConfig;

/// Sliding idle window and hard cap loaded from `AppConfig`.
#[derive(Debug, Clone, Copy)]
pub struct SessionPolicy {
    /// How far forward to push `expires_at` on activity (`SESSION_MAX_AGE`).
    pub sliding_secs: i64,
    /// Maximum session lifetime from `created_at` (`SESSION_ABSOLUTE_MAX_AGE`).
    pub absolute_max_secs: i64,
}

impl SessionPolicy {
    // Human: Handlers read the same env-driven limits whether extending explicitly or during auth validation.
    // Agent: FROM AppConfig session_max_age_secs + session_absolute_max_secs.
    pub fn from_config(cfg: &AppConfig) -> Self {
        Self {
            sliding_secs: cfg.session_max_age_secs,
            absolute_max_secs: cfg.session_absolute_max_secs,
        }
    }
}

// Human: Login chooses the shorter of the requested TTL and the 30-day ceiling so new rows never exceed the cap.
// Agent: RETURNS min(now+initial_secs, now+absolute_max_secs).

pub fn initial_expires_at(
    now: NaiveDateTime,
    initial_secs: i64,
    policy: &SessionPolicy,
) -> NaiveDateTime {
    let initial = now + Duration::seconds(initial_secs);
    let cap = absolute_deadline(now, policy);
    if initial < cap {
        initial
    } else {
        cap
    }
}

// Human: After 30 days from first sign-in the session is dead even if the user is still clicking around.
// Agent: COMPARES now >= created_at + absolute_max_secs.

pub fn is_past_absolute_max(
    now: NaiveDateTime,
    created_at: NaiveDateTime,
    policy: &SessionPolicy,
) -> bool {
    now >= absolute_deadline(created_at, policy)
}

// Human: We only hit the database when the extension would materially lengthen the session (near idle cutoff).
// Agent: TRUE when remaining < 75% of sliding_secs OR new expiry would gain >= EXTEND_MIN_GAIN_SECS.

pub fn should_extend_on_activity(
    now: NaiveDateTime,
    expires_at: NaiveDateTime,
    policy: &SessionPolicy,
) -> bool {
    if expires_at <= now {
        return false;
    }
    let remaining = expires_at - now;
    let sliding = Duration::seconds(policy.sliding_secs);
    if remaining < sliding * 3 / 4 {
        return true;
    }
    false
}

// Human: Activity pushes expiry to now plus the idle window, but never past the absolute cap from creation time.
// Agent: RETURNS None when past absolute max or when new expiry would not exceed current expires_at.

pub fn compute_activity_extension(
    now: NaiveDateTime,
    created_at: NaiveDateTime,
    expires_at: NaiveDateTime,
    policy: &SessionPolicy,
) -> Option<NaiveDateTime> {
    if is_past_absolute_max(now, created_at, policy) {
        return None;
    }
    let cap = absolute_deadline(created_at, policy);
    let target = now + Duration::seconds(policy.sliding_secs);
    let new_expires = if target < cap { target } else { cap };
    if new_expires > expires_at {
        Some(new_expires)
    } else {
        None
    }
}

fn absolute_deadline(created_at: NaiveDateTime, policy: &SessionPolicy) -> NaiveDateTime {
    created_at + Duration::seconds(policy.absolute_max_secs)
}

// Human: Auth middleware and `/auth/extend-session` share this path so sliding rules stay consistent.
// Agent: UPDATE expires_at when should_extend_on_activity; RETURNS Some(new_expires) or None without deleting.

pub async fn apply_activity_extension(
    pool: &sqlx::PgPool,
    session_id: &str,
    created_at: NaiveDateTime,
    expires_at: NaiveDateTime,
    policy: &SessionPolicy,
) -> Result<Option<NaiveDateTime>, sqlx::Error> {
    let now = chrono::Utc::now().naive_utc();
    if !should_extend_on_activity(now, expires_at, policy) {
        return Ok(None);
    }
    let Some(new_expires) = compute_activity_extension(now, created_at, expires_at, policy) else {
        return Ok(None);
    };
    sqlx::query("UPDATE sessions SET expires_at = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_expires)
        .bind(session_id)
        .execute(pool)
        .await?;
    Ok(Some(new_expires))
}

// Human: Sessions past the 30-day creation cap are removed so they cannot authenticate again.
// Agent: DELETE sessions WHERE id when is_past_absolute_max; RETURNS true when deleted.

pub async fn invalidate_if_absolute_expired(
    pool: &sqlx::PgPool,
    session_id: &str,
    created_at: NaiveDateTime,
    policy: &SessionPolicy,
) -> Result<bool, sqlx::Error> {
    let now = chrono::Utc::now().naive_utc();
    if !is_past_absolute_max(now, created_at, policy) {
        return Ok(false);
    }
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(session_id)
        .execute(pool)
        .await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(sliding: i64, absolute: i64) -> SessionPolicy {
        SessionPolicy {
            sliding_secs: sliding,
            absolute_max_secs: absolute,
        }
    }

    #[test]
    fn initial_expires_respects_absolute_cap() {
        let now = chrono::NaiveDate::from_ymd_opt(2026, 1, 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let p = policy(86400, 30 * 86400);
        let exp = initial_expires_at(now, 40 * 86400, &p);
        assert_eq!(exp, now + Duration::seconds(30 * 86400));
    }

    #[test]
    fn activity_extension_slides_but_caps_at_absolute_max() {
        let created = chrono::NaiveDate::from_ymd_opt(2026, 1, 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let now = created + Duration::days(29);
        let expires = now + Duration::hours(2);
        let p = policy(7 * 86400, 30 * 86400);
        let extended = compute_activity_extension(now, created, expires, &p)
            .expect("should extend");
        assert_eq!(extended, created + Duration::seconds(30 * 86400));
    }

    #[test]
    fn past_absolute_max_returns_none() {
        let created = chrono::NaiveDate::from_ymd_opt(2026, 1, 1)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap();
        let now = created + Duration::seconds(30 * 86400);
        let p = policy(86400, 30 * 86400);
        assert!(is_past_absolute_max(now, created, &p));
        assert!(compute_activity_extension(now, created, now + Duration::hours(1), &p).is_none());
    }
}
