//! In-memory ring-buffer logs keyed by `background_jobs.id` for admin live tail and post-mortem inspection.

// Human: Each background job gets a timestamped line buffer so operators can debug runs from the Jobs detail dialog without SSH or log aggregation.
// Agent: JobLogRegistry Mutex HashMap job_id→VecDeque; broadcast (job_id,line); JobLogger cheap Clone wrapper for handlers; MAX_LINES per job + prune stale entries.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use tokio::sync::broadcast;

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

    pub fn append(&self, job_id: &str, message: &str) {
        let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
        let line = format!("{ts} {message}");
        if let Ok(mut map) = self.inner.lock() {
            let deque = map.entry(job_id.to_string()).or_insert_with(VecDeque::new);
            while deque.len() >= self.max_lines {
                deque.pop_front();
            }
            deque.push_back(line.clone());
            if map.len() > self.max_jobs {
                Self::prune_oldest_job(&mut map);
            }
        }
        let _ = self.live.send((job_id.to_string(), line));
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
    job_id: String,
}

impl JobLogger {
    pub fn new(registry: Arc<JobLogRegistry>, job_id: &str) -> Self {
        Self {
            registry,
            job_id: job_id.to_string(),
        }
    }

    pub fn log(&self, message: &str) {
        self.registry.append(&self.job_id, message);
    }

    pub fn job_id(&self) -> &str {
        &self.job_id
    }
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
