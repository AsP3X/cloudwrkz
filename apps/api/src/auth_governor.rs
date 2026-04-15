//! Per-IP rate limiting for `/auth/*` (login, register, etc.).

use axum::body::Body;
use governor::middleware::NoOpMiddleware;
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::SmartIpKeyExtractor;

use crate::config::AppConfig;

/// Layer limiting brute-force traffic to auth endpoints. Keyed by client IP
/// (`X-Forwarded-For` / `X-Real-IP` / `Forwarded` when present, else peer IP — requires
/// [`axum::serve`] with [`axum::extract::connect_info::IntoMakeServiceWithConnectInfo`]).
pub fn auth_rate_limit_layer(
    config: &AppConfig,
) -> GovernorLayer<SmartIpKeyExtractor, NoOpMiddleware, Body> {
    let mut builder = GovernorConfigBuilder::default().key_extractor(SmartIpKeyExtractor);
    builder.period(config.auth_rate_limit_refill_period);
    builder.burst_size(config.auth_rate_limit_burst);
    let governor_conf = builder
        .finish()
        .expect("AUTH_RATE_LIMIT_PER_MINUTE and AUTH_RATE_LIMIT_BURST must produce a valid quota");
    GovernorLayer::new(governor_conf)
}
