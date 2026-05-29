//! Supervises N background job dispatchers: keeps the running count at the configured minimum,
//! shares per-process concurrency budgets across dispatchers, and exposes ring-buffer logs per worker.

// Human: The supervisor scales the number of dispatcher tasks toward a DB-backed desired count while keeping abort handles for clean shutdown.
// Agent: JobWorkerSupervisor HOLDS desired AtomicU32 + abort_by_id map; reconcile loop SPAWNS/kills run_job_queue_dispatcher_loop; WorkerLogRegistry ring buffer + broadcast.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sqlx::PgPool;
use tokio::sync::broadcast;
use tokio::task::{AbortHandle, JoinHandle};

use crate::command_queue::MutationBroker;
use crate::config::AppConfig;

use super::job_log::JobLogRegistry;
use super::run_job_queue_dispatcher_loop;

pub const SYSTEM_SETTING_JOB_QUEUE_WORKER_COUNT: &str = "job_queue_worker_count";

pub const JOB_QUEUE_WORKER_MIN: u32 = 1;
pub const JOB_QUEUE_WORKER_MAX: u32 = 32;

const RECONCILE_INTERVAL: Duration = Duration::from_millis(250);
const WORKER_LOG_MAX_LINES: usize = 2_000;

/// Ring buffer + broadcast fan-out for per-dispatcher logs (admin inspection).
// Human: Operators tail dispatcher stdout asynchronously; the ring buffer caps memory while subscribers miss slow reads without blocking workers.
// Agent: Mutex VecDeque per worker_id capped max_lines; broadcast channel 1024 for live tail; append pushes timestamped line.

pub struct WorkerLogRegistry {
    inner: Mutex<HashMap<u64, VecDeque<String>>>,
    live: broadcast::Sender<(u64, String)>,
    max_lines: usize,
}

impl WorkerLogRegistry {
    fn new(max_lines: usize) -> Self {
        let (live, _) = broadcast::channel(1024);
        Self {
            inner: Mutex::new(HashMap::new()),
            live,
            max_lines,
        }
    }

    pub fn append(&self, worker_id: u64, message: &str) {
        let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ");
        let line = format!("{ts} {message}");
        if let Ok(mut map) = self.inner.lock() {
            let deque = map.entry(worker_id).or_insert_with(VecDeque::new);
            while deque.len() >= self.max_lines {
                deque.pop_front();
            }
            deque.push_back(line.clone());
        }
        let _ = self.live.send((worker_id, line));
    }

    pub fn lines_for(&self, worker_id: u64) -> Vec<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|m| m.get(&worker_id).cloned())
            .map(|d| d.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(u64, String)> {
        self.live.subscribe()
    }
}

pub struct JobWorkerSupervisor {
    desired: Arc<AtomicU32>,
    env_default: u32,
    logs: Arc<WorkerLogRegistry>,
    job_logs: Arc<JobLogRegistry>,
    abort_by_id: Arc<Mutex<HashMap<u64, AbortHandle>>>,
    started_at_ms: Arc<Mutex<HashMap<u64, i64>>>,
}

impl JobWorkerSupervisor {
    pub fn desired_count(&self) -> u32 {
        self.desired.load(Ordering::SeqCst)
    }

    pub fn env_default(&self) -> u32 {
        self.env_default
    }

    pub fn set_desired_count(&self, n: u32) {
        self.desired.store(
            n.clamp(JOB_QUEUE_WORKER_MIN, JOB_QUEUE_WORKER_MAX),
            Ordering::SeqCst,
        );
    }

    pub fn logs(&self) -> Arc<WorkerLogRegistry> {
        self.logs.clone()
    }

    pub fn job_logs(&self) -> Arc<JobLogRegistry> {
        self.job_logs.clone()
    }

    pub fn list_workers(&self) -> Vec<WorkerListEntry> {
        let ids = self
            .abort_by_id
            .lock()
            .ok()
            .map(|m| m.keys().copied().collect::<Vec<_>>())
            .unwrap_or_default();
        let times = self.started_at_ms.lock().ok();
        ids.into_iter()
            .map(|id| WorkerListEntry {
                id,
                started_at_ms: times
                    .as_ref()
                    .and_then(|t| t.get(&id).copied())
                    .unwrap_or(0),
                running: true,
            })
            .collect()
    }

    /// Stops one dispatcher task; the supervisor respawns if running count falls below desired.
    pub fn restart_worker(&self, id: u64) -> bool {
        if let Ok(map) = self.abort_by_id.lock() {
            if let Some(h) = map.get(&id) {
                h.abort();
                return true;
            }
        }
        false
    }

    /// Lowers desired count by one and aborts the given worker when present (scale down).
    pub fn dismiss_worker(&self, id: u64) -> Result<(), &'static str> {
        let current = self.desired.load(Ordering::SeqCst);
        if current <= JOB_QUEUE_WORKER_MIN {
            return Err("cannot go below minimum worker count");
        }
        self.desired.store(current - 1, Ordering::SeqCst);
        if let Ok(map) = self.abort_by_id.lock() {
            if let Some(h) = map.get(&id) {
                h.abort();
            }
        }
        Ok(())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerListEntry {
    pub id: u64,
    pub started_at_ms: i64,
    pub running: bool,
}

pub async fn resolve_initial_worker_count(pool: &PgPool, config: &AppConfig) -> u32 {
    let row: Option<i64> = sqlx::query_scalar(
        r#"SELECT CASE
              WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::bigint
              WHEN jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^[0-9]+$'
                THEN (value #>> '{}')::bigint
              ELSE NULL
            END
            FROM system_settings
            WHERE key = $1
            LIMIT 1"#,
    )
    .bind(SYSTEM_SETTING_JOB_QUEUE_WORKER_COUNT)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    row.map(|v| (v as u32).clamp(JOB_QUEUE_WORKER_MIN, JOB_QUEUE_WORKER_MAX))
        .unwrap_or(config.job_queue_worker_count)
}

pub async fn persist_worker_count(pool: &PgPool, count: u32) -> Result<(), sqlx::Error> {
    let v = count.clamp(JOB_QUEUE_WORKER_MIN, JOB_QUEUE_WORKER_MAX);
    let value_json = serde_json::json!(v);
    sqlx::query(
        r#"INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"#,
    )
    .bind(SYSTEM_SETTING_JOB_QUEUE_WORKER_COUNT)
    .bind(&value_json)
    .execute(pool)
    .await?;
    Ok(())
}

struct RunningEntry {
    id: u64,
    handle: JoinHandle<()>,
    abort: AbortHandle,
}

/// Spawns a supervisor task that maintains `initial_desired` dispatchers (each runs the same dequeue loop).
pub fn spawn_job_queue_supervisor(
    pool: PgPool,
    config: AppConfig,
    mutation_broker: MutationBroker,
    initial_desired: u32,
    env_default: u32,
) -> Arc<JobWorkerSupervisor> {
    let desired = Arc::new(AtomicU32::new(
        initial_desired.clamp(JOB_QUEUE_WORKER_MIN, JOB_QUEUE_WORKER_MAX),
    ));
    let logs = Arc::new(WorkerLogRegistry::new(WORKER_LOG_MAX_LINES));
    let job_logs = Arc::new(JobLogRegistry::new());
    let abort_by_id: Arc<Mutex<HashMap<u64, AbortHandle>>> = Arc::new(Mutex::new(HashMap::new()));
    let started_at_ms: Arc<Mutex<HashMap<u64, i64>>> = Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(AtomicU64::new(1));

    let sup = Arc::new(JobWorkerSupervisor {
        desired: desired.clone(),
        env_default,
        logs: logs.clone(),
        job_logs: job_logs.clone(),
        abort_by_id: abort_by_id.clone(),
        started_at_ms: started_at_ms.clone(),
    });

    tokio::spawn(supervisor_loop(
        pool,
        config,
        mutation_broker,
        desired,
        logs,
        job_logs,
        abort_by_id,
        started_at_ms,
        next_id,
    ));

    sup
}

async fn supervisor_loop(
    pool: PgPool,
    config: AppConfig,
    mutation_broker: MutationBroker,
    desired: Arc<AtomicU32>,
    logs: Arc<WorkerLogRegistry>,
    job_logs: Arc<JobLogRegistry>,
    abort_by_id: Arc<Mutex<HashMap<u64, AbortHandle>>>,
    started_at_ms: Arc<Mutex<HashMap<u64, i64>>>,
    next_id: Arc<AtomicU64>,
) {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(event = "job_queue.client", error = %e, "reqwest client build failed");
            return;
        }
    };

    let policies = super::policies_from_config(&config);
    let budgets = std::sync::Arc::new(super::budget::TypeBudgets::new(policies));
    let github_rate = crate::github_rate_limit::GithubRestRateLimit::from_config(&config);

    super::requeue_interrupted_processing_jobs(&pool).await;
    super::reclaim_stale_processing_jobs(&pool).await;

    let mut running: Vec<RunningEntry> = Vec::new();

    loop {
        running.retain(|w| {
            if w.handle.is_finished() {
                logs.append(
                    w.id,
                    "dispatcher task ended (supervisor will respawn if below desired count)",
                );
                if let Ok(mut m) = abort_by_id.lock() {
                    m.remove(&w.id);
                }
                if let Ok(mut t) = started_at_ms.lock() {
                    t.remove(&w.id);
                }
                return false;
            }
            true
        });

        let want = desired.load(Ordering::SeqCst) as usize;

        while running.len() < want {
            let id = next_id.fetch_add(1, Ordering::SeqCst);
            let pool = pool.clone();
            let client = client.clone();
            let github_rate = github_rate.clone();
            let mutation_broker = mutation_broker.clone();
            let budgets = budgets.clone();
            let logs_task = logs.clone();
            let job_logs_task = job_logs.clone();
            let abort_by_id = abort_by_id.clone();
            let started_map = started_at_ms.clone();

            let t0 = now_unix_ms();
            if let Ok(mut t) = started_map.lock() {
                t.insert(id, t0);
            }

            let handle = tokio::spawn(async move {
                run_job_queue_dispatcher_loop(
                    pool,
                    client,
                    github_rate,
                    mutation_broker,
                    budgets,
                    id,
                    logs_task,
                    job_logs_task,
                )
                .await;
            });
            let abort = handle.abort_handle();
            if let Ok(mut m) = abort_by_id.lock() {
                m.insert(id, abort.clone());
            }
            running.push(RunningEntry { id, handle, abort });
            logs.append(id, "background job dispatcher started");
        }

        while running.len() > want {
            let w = running.remove(0);
            logs.append(
                w.id,
                "dispatcher stopped (scale down — desired count lowered)",
            );
            w.abort.abort();
            if let Ok(mut m) = abort_by_id.lock() {
                m.remove(&w.id);
            }
            if let Ok(mut t) = started_at_ms.lock() {
                t.remove(&w.id);
            }
        }

        tokio::time::sleep(RECONCILE_INTERVAL).await;
    }
}

pub fn worker_hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string())
}

pub fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}
