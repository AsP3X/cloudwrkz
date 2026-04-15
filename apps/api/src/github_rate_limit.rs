//! Shared GitHub REST API rate limiting for the process (anonymous: rolling hourly cap, default 60 requests/hour per GitHub’s unauthenticated rules).
//! When `GITHUB_TOKEN` / `GITHUB_API_TOKEN` is set, no in-process cap is applied (GitHub enforces authenticated limits).
//!
//! See repository doc: `docs/background-jobs-and-github.md`.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::RequestBuilder;

use crate::config::AppConfig;

const GITHUB_ANONYMOUS_WINDOW: Duration = Duration::from_secs(3600);

/// Tracks anonymous GitHub REST calls in a rolling hour window. Skips limiting when a token is configured.
pub struct GithubRestRateLimit {
    token: Option<Arc<str>>,
    max_anonymous_per_hour: u32,
    window: Mutex<VecDeque<Instant>>,
}

impl GithubRestRateLimit {
    pub fn from_config(config: &AppConfig) -> Arc<Self> {
        let token: Option<Arc<str>> = config.github_api_token.as_ref().and_then(|s| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(Arc::from(t.to_string()))
            }
        });
        Arc::new(Self {
            token,
            max_anonymous_per_hour: config.github_anonymous_max_requests_per_hour.max(1),
            window: Mutex::new(VecDeque::new()),
        })
    }

    pub fn apply_auth(&self, req: RequestBuilder) -> RequestBuilder {
        match &self.token {
            Some(t) => req.header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", t.as_ref()),
            ),
            None => req,
        }
    }

    /// Reserve `n` slots in the anonymous hourly window (no-op when a GitHub token is configured).
    pub async fn acquire(&self, n: u32) {
        if self.token.is_some() || n == 0 {
            return;
        }

        loop {
            let wait: Option<Duration> = {
                let mut guard = self.window.lock().expect("github rate limit mutex poisoned");
                let now = Instant::now();
                while guard
                    .front()
                    .is_some_and(|t| now.duration_since(*t) >= GITHUB_ANONYMOUS_WINDOW)
                {
                    guard.pop_front();
                }
                let len = guard.len() as u32;
                if len + n <= self.max_anonymous_per_hour {
                    for _ in 0..n {
                        guard.push_back(Instant::now());
                    }
                    return;
                }
                guard.front().copied().map(|oldest| {
                    let expiry = oldest + GITHUB_ANONYMOUS_WINDOW;
                    expiry
                        .checked_duration_since(Instant::now())
                        .unwrap_or(Duration::from_millis(1))
                })
            };

            let w = wait.unwrap_or(Duration::from_secs(1));
            tokio::time::sleep(w.max(Duration::from_millis(1))).await;
        }
    }
}
