//! HTTP request telemetry: classify each completed request and append a row to `http_request_logs`.
//!
//! Human: Writes are fire-and-forget so slow DB work never blocks the response path.
//! Agent: INSERT http_request_logs async; READS AppConfig.http_request_log_enabled; SPAWNS tokio task per request.

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, Response, StatusCode};
use axum::middleware::Next;
use sqlx::PgPool;
use sqlx::types::Json;
use std::sync::Arc;
use std::time::Instant;
use tracing::warn;

use crate::audit::{client_ip_from_headers, request_id_from_headers};
use crate::routes::AppState;

const MAX_PATH_LEN: usize = 2048;
const MAX_QUERY_LEN: usize = 1024;
const MAX_UA_LEN: usize = 512;

/// Row payload for `http_request_logs` (async insert).
struct HttpRequestLogRow {
    request_id: String,
    method: String,
    path: String,
    query_string: Option<String>,
    status_code: i16,
    latency_ms: i32,
    client_ip: Option<String>,
    user_agent: Option<String>,
    category: String,
    outcome: String,
    client_class: String,
    anomaly_signals: Vec<String>,
}

/// Bucket the URL into a stable namespace for analytics (independent of HTTP status).
// Human: Order matters: v1 and public QR mounts live on different prefixes.
// Agent: PREFIX /api/v1 -> api_v1; PREFIX /api/auth/qr-login -> qr_login_public; legacy health paths -> legacy_health; ELSE other.
fn route_category(path: &str) -> &'static str {
    if path.starts_with("/api/v1") {
        "api_v1"
    } else if path.starts_with("/api/auth/qr-login") {
        "qr_login_public"
    } else if path.starts_with("/api/health")
        || path.starts_with("/api/ping")
        || path.starts_with("/api/ready")
    {
        "legacy_health"
    } else {
        "other"
    }
}

/// Map status code to a coarse outcome label for dashboards and alerts.
// Human: Buckets HTTP status into short strings so operators can aggregate success vs client vs server failures without raw codes only.
// Agent: MAPS u16 ranges to success|redirect|client_error|server_error|not_found|unknown; READS status.as_u16().

fn outcome_from_status(status: StatusCode) -> &'static str {
    let s = status.as_u16();
    match s {
        404 => "not_found",
        200..=299 => "success",
        300..=399 => "redirect",
        400..=499 => "client_error",
        500..=599 => "server_error",
        _ => "unknown",
    }
}

/// Classify the caller from path + User-Agent (best-effort; never blocks on parsing).
// Human: UniFi-style `/inform` probes get their own bucket even if UA is odd.
// Agent: PATH /inform OR UA aircontrol -> unifi_inform_agent; browser substrings -> browser; curl/go/http -> http_tool.
fn client_class(path: &str, user_agent: Option<&str>) -> &'static str {
    if path == "/inform" {
        return "unifi_inform_agent";
    }
    let ua = user_agent.unwrap_or("").trim();
    let ua_lc = ua.to_ascii_lowercase();
    if ua_lc.contains("aircontrol") {
        return "unifi_inform_agent";
    }
    if ua.is_empty() {
        return "no_user_agent";
    }
    if ua_lc.contains("mozilla")
        || ua_lc.contains("chrome/")
        || ua_lc.contains("safari/")
        || ua_lc.contains("edg/")
    {
        return "browser";
    }
    if ua_lc.contains("curl")
        || ua_lc.contains("wget")
        || ua_lc.contains("axios")
        || ua_lc.contains("reqwest")
        || ua_lc.contains("go-http")
    {
        return "http_tool";
    }
    if ua_lc.contains("kube")
        || ua_lc.contains("prometheus")
        || ua_lc.contains("healthcheck")
        || ua_lc.contains("uptime")
    {
        return "monitoring";
    }
    "unknown"
}

/// Heuristic tags for later SQL / alerting (e.g. UniFi traffic hitting this API).
// Human: Extra tags highlight odd traffic patterns (UniFi hitting wrong host, unmatched paths) without failing the request.
// Agent: PUSHES unmatched_path, unifi_inform_traffic, unifi_inform_mismatch based on category/outcome/client_class combos.

fn anomaly_signals(category: &str, outcome: &str, client_class: &str) -> Vec<String> {
    let mut out = Vec::new();
    if outcome == "not_found" && category == "other" {
        out.push("unmatched_path".to_string());
    }
    if client_class == "unifi_inform_agent" {
        out.push("unifi_inform_traffic".to_string());
    }
    if client_class == "unifi_inform_agent" && outcome == "not_found" {
        out.push("unifi_inform_mismatch".to_string());
    }
    out
}

// Human: Paths and query strings are capped so a malicious client cannot allocate multi-megabyte log rows.
// Agent: RETURNS full s if len<=max; ELSE collects chars up to max (char boundary safe).

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

/// Build a log row from the request/response metadata.
// Human: Pulls together category, outcome, client class, and anomaly tags before the async insert runs in the background.
// Agent: CALLS route_category, outcome_from_status, client_class, anomaly_signals; COPIES strings into HttpRequestLogRow.

fn build_row(
    request_id: String,
    method: axum::http::Method,
    path: String,
    query: Option<String>,
    status: StatusCode,
    latency_ms: u64,
    client_ip: Option<String>,
    user_agent: Option<String>,
) -> HttpRequestLogRow {
    let category = route_category(&path).to_string();
    let outcome = outcome_from_status(status).to_string();
    let ua_ref = user_agent.as_deref();
    let cc = client_class(&path, ua_ref);
    let client_class_str = cc.to_string();
    let signals_vec = anomaly_signals(&category, &outcome, cc);

    HttpRequestLogRow {
        request_id,
        method: method.to_string(),
        path,
        query_string: query,
        status_code: status.as_u16() as i16,
        latency_ms: latency_ms.min(i32::MAX as u64) as i32,
        client_ip,
        user_agent,
        category,
        outcome,
        client_class: client_class_str,
        anomaly_signals: signals_vec,
    }
}

/// Persist one row; errors are logged only (same contract as audit logging).
// Human: Inserts never propagate to the client; failures emit a tracing warning with the request id for later correlation.
// Agent: INSERT INTO http_request_logs all row fields; BINDS Json array for anomaly_signals; LOGS warn on sqlx Err only.

async fn insert_http_request_log(pool: &PgPool, row: HttpRequestLogRow) {
    let HttpRequestLogRow {
        request_id,
        method,
        path,
        query_string,
        status_code,
        latency_ms,
        client_ip,
        user_agent,
        category,
        outcome,
        client_class,
        anomaly_signals,
    } = row;

    let request_id_for_log = request_id.clone();
    let id = crate::id::new_cuid();
    let signals = Json(serde_json::Value::Array(
        anomaly_signals
            .into_iter()
            .map(serde_json::Value::String)
            .collect(),
    ));
    let res = sqlx::query(
        r#"INSERT INTO http_request_logs (
            id, request_id, method, path, query_string,
            status_code, latency_ms, client_ip, user_agent,
            category, outcome, client_class, anomaly_signals
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"#,
    )
    .bind(&id)
    .bind(&request_id)
    .bind(&method)
    .bind(&path)
    .bind(&query_string)
    .bind(status_code)
    .bind(latency_ms)
    .bind(&client_ip)
    .bind(&user_agent)
    .bind(&category)
    .bind(&outcome)
    .bind(&client_class)
    .bind(signals)
    .execute(pool)
    .await;

    if let Err(e) = res {
        warn!(
            event = "http_request_log.write_failed",
            request_id = %request_id_for_log,
            "http_request_logs insert failed: {}",
            e
        );
    }
}

/// Axum middleware: time the inner stack, then enqueue a DB insert.
// Human: When logging is disabled we skip work entirely so benchmarks and tests stay quiet.
// Agent: READS config.http_request_log_enabled; SPAWNS insert_http_request_log; PASSES through response unchanged.
pub(crate) async fn middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response<Body> {
    if !state.config.http_request_log_enabled {
        return next.run(req).await;
    }

    let request_id = request_id_from_headers(req.headers());
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path_raw = uri.path();
    let path = truncate(path_raw, MAX_PATH_LEN);
    let query = uri
        .query()
        .map(|q| truncate(q, MAX_QUERY_LEN))
        .filter(|s| !s.is_empty());
    let headers = req.headers().clone();
    let client_ip = client_ip_from_headers(&headers);
    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|s| truncate(s, MAX_UA_LEN))
        .filter(|s| !s.is_empty());

    let start = Instant::now();
    let response = next.run(req).await;
    let latency_ms = start.elapsed().as_millis().min(u64::MAX as u128) as u64;
    let status = response.status();

    let row = build_row(
        request_id, method, path, query, status, latency_ms, client_ip, user_agent,
    );

    let pool = Arc::new(state.pool.clone());
    // Human: Logging runs after the response is ready so a slow `http_request_logs` table never delays the user-visible latency.
    // Agent: SPAWNS tokio task owning Arc<Pool> + row; CALLS insert_http_request_log; DROPS result except internal warn!.
    tokio::spawn(async move {
        insert_http_request_log(pool.as_ref(), row).await;
    });

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_category_buckets() {
        assert_eq!(route_category("/api/v1/me"), "api_v1");
        assert_eq!(
            route_category("/api/auth/qr-login/request"),
            "qr_login_public"
        );
        assert_eq!(route_category("/api/health"), "legacy_health");
        assert_eq!(route_category("/inform"), "other");
    }

    #[test]
    fn client_class_unifi() {
        assert_eq!(client_class("/inform", None), "unifi_inform_agent");
        assert_eq!(
            client_class("/x", Some("AirControl Agent v1.0")),
            "unifi_inform_agent"
        );
    }

    #[test]
    fn anomaly_lists_unifi_mismatch() {
        let s = anomaly_signals("other", "not_found", "unifi_inform_agent");
        assert!(s.iter().any(|e| e == "unifi_inform_mismatch"));
        assert!(s.iter().any(|e| e == "unifi_inform_traffic"));
    }
}
