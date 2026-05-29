//! In-memory ring-buffer logs keyed by `background_jobs.id` for admin live tail and post-mortem inspection.
//!
//! Lines are also appended to `background_jobs.processing_log` so logs survive API restarts and are
//! readable from any API instance.

// Human: Each background job gets a timestamped line buffer so operators can debug runs from the Jobs detail dialog without SSH or log aggregation.
// Agent: JobLogRegistry Mutex HashMap job_id→VecDeque; broadcast (job_id,line); JobLogger WRITES memory + async DB append; fetch_job_log_lines READS DB merged with memory.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use sqlx::PgPool;
use tokio::sync::broadcast;
use tracing::warn;

const JOB_LOG_MAX_LINES: usize = 500;
const JOB_LOG_MAX_JOBS: usize = 2_000;

/// Ring buffer + broadcast fan-out for per-job logs (admin Jobs detail dialog).
// Human: Subscribers filter by job id on the SSE route; slow clients may miss lines but the ring buffer keeps recent history.
// Agent: append WRITES deque capped JOB_LOG_MAX_LINES; send live tuple; prune_oldest_when_over_cap when map len > JOB_LOG_MAX_JOBS.

pub struct JobLogRegistry {
    inner: Mutex<HashMap<String, VecDeque<String>>>,
    live: broadcast::Sender<(String, String)>,
    max_lines: usize,
    max_jobs: usize,
}

impl JobLogRegistry {
    pub fn new() -> Self {
        let (live, _) = broadcast::channel(1024);
        Self {
            inner: Mutex::new(HashMap::new()),
            live,
            max_lines: JOB_LOG_MAX_LINES,
            max_jobs: JOB_LOG_MAX_JOBS,
        }
    }

    pub fn append_memory(&self, job_id: &str, line: &str) {
        if let Ok(mut map) = self.inner.lock() {
            let deque = map.entry(job_id.to_string()).or_insert_with(VecDeque::new);
            while deque.len() >= self.max_lines {
                deque.pop_front();
            }
            deque.push_back(line.to_string());
            if map.len() > self.max_jobs {
                Self::prune_oldest_job(&mut map);
            }
        }
        let _ = self.live.send((job_id.to_string(), line.to_string()));
    }

    fn prune_oldest_job(map: &mut HashMap<String, VecDeque<String>>) {
        if let Some(oldest_key) = map.keys().next().cloned() {
            map.remove(&oldest_key);
        }
    }

    pub fn lines_for(&self, job_id: &str) -> Vec<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|m| m.get(job_id).cloned())
            .map(|d| d.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(String, String)> {
        self.live.subscribe()
    }
}

/// Lightweight handle passed into job handlers for append-only logging.
#[derive(Clone)]
pub struct JobLogger {
    registry: Arc<JobLogRegistry>,
    pool: PgPool,
    job_id: String,
}

impl JobLogger {
    pub fn new(registry: Arc<JobLogRegistry>, pool: PgPool, job_id: &str) -> Self {
        Self {
            registry,
            pool,
            job_id: job_id.to_string(),
        }
    }

    pub fn log(&self, message: &str) {
        let line = Self::format_line(message);
        self.registry.append_memory(&self.job_id, &line);
        let pool = self.pool.clone();
        let job_id = self.job_id.clone();
        tokio::spawn(async move {
            persist_job_log_line(&pool, &job_id, &line).await;
        });
    }

    /// Write a line to memory and await DB persistence (claim/start/finish/heartbeat).
    // Human: Lifecycle lines must appear in the admin log immediately even when the handler later hangs or the API restarts.
    // Agent: WRITES memory; AWAITS persist_job_log_line; USE for claim/start/heartbeat/finish paths.

    pub async fn log_critical(&self, message: &str) {
        let line = Self::format_line(message);
        self.registry.append_memory(&self.job_id, &line);
        persist_job_log_line(&self.pool, &self.job_id, &line).await;
    }

    fn format_line(message: &str) -> String {
        let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
        format!("{ts} {message}")
    }

    pub fn job_id(&self) -> &str {
        &self.job_id
    }
}

// Human: DB persistence is best-effort so logging never blocks job handlers or panics the worker.
// Agent: UPDATE background_jobs SET processing_log = processing_log || jsonb_build_array($line) WHERE id; LOGS warn on sqlx Err.

pub async fn persist_job_log_line(pool: &PgPool, job_id: &str, line: &str) {
    if let Err(e) = sqlx::query(
        r#"UPDATE background_jobs
           SET processing_log = COALESCE(processing_log, '[]'::jsonb) || jsonb_build_array($2::text),
               updated_at = clock_timestamp()
           WHERE id = $1"#,
    )
    .bind(job_id)
    .bind(line)
    .execute(pool)
    .await
    {
        warn!(
            event = "jobs.log_persist_failed",
            job_id = %job_id,
            error = %e,
            "could not append background_jobs.processing_log line"
        );
    }
}

// Human: Admin log API merges DB history with any in-memory lines not yet visible in a read replica lag scenario.
// Agent: SELECT processing_log jsonb array; MERGE with memory lines deduped by exact string; RETURNS Vec<String>.

pub async fn fetch_job_log_lines(
    pool: &PgPool,
    registry: &JobLogRegistry,
    job_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let stored: Option<serde_json::Value> =
        sqlx::query_scalar("SELECT processing_log FROM background_jobs WHERE id = $1")
            .bind(job_id)
            .fetch_optional(pool)
            .await?;

    let db_lines: Vec<String> = stored
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.into_iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let memory_lines = registry.lines_for(job_id);
    if memory_lines.is_empty() {
        return Ok(db_lines);
    }

    let mut merged = db_lines;
    for line in memory_lines {
        if !merged.contains(&line) {
            merged.push(line);
        }
    }
    Ok(merged)
}

/// Safe one-line summary of payload keys for job logs (never includes secret field values).
// Human: Operators need context without leaking passwords or tokens from auth payloads.
// Agent: LISTS top-level keys; REDACTS password/token/secret substrings in key names; INCLUDES link_id when present.

pub fn payload_keys_summary(payload: &serde_json::Value) -> String {
    let Some(obj) = payload.as_object() else {
        return "(non-object payload)".into();
    };
    let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let redacted: Vec<String> = keys
        .into_iter()
        .map(|k| {
            let lower = k.to_ascii_lowercase();
            if lower.contains("password")
                || lower.contains("token")
                || lower.contains("secret")
                || lower.contains("credential")
            {
                format!("{k}:<redacted>")
            } else if let Some(v) = obj.get(k).and_then(|v| v.as_str()) {
                if v.len() <= 120 {
                    format!("{k}={v}")
                } else {
                    format!("{k}=<{} chars>", v.len())
                }
            } else {
                k.to_string()
            }
        })
        .collect();
    if redacted.is_empty() {
        "(empty object)".into()
    } else {
        redacted.join(", ")
    }
}

/// Append a system line directly (startup requeue / stale reclaim) without broadcast fan-out.
// Human: Recovery paths need an audit trail in the same column the UI reads, even when no worker task is attached.
// Agent: CALLS persist_job_log_line only; NO memory registry write unless caller also logs via JobLogger.

pub async fn append_system_job_log_line(pool: &PgPool, job_id: &str, message: &str) {
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
    let line = format!("{ts} {message}");
    persist_job_log_line(pool, job_id, &line).await;
}

/// Same as [`append_system_job_log_line`] but also mirrors into the in-memory registry for live SSE.
// Human: Stale-reclaim and claim paths should show up in the live tail without waiting for a handler-owned JobLogger.
// Agent: CALLS registry.append_memory + persist_job_log_line.

pub async fn append_system_job_log_line_with_registry(
    pool: &PgPool,
    registry: &JobLogRegistry,
    job_id: &str,
    message: &str,
) {
    let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
    let line = format!("{ts} {message}");
    registry.append_memory(job_id, &line);
    persist_job_log_line(pool, job_id, &line).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn payload_keys_summary_redacts_secrets() {
        let payload = json!({
            "link_id": "abc",
            "password": "secret",
            "user_id": "u1"
        });
        let s = payload_keys_summary(&payload);
        assert!(s.contains("link_id=abc"));
        assert!(s.contains("password:<redacted>"));
        assert!(!s.contains("secret"));
    }
}
