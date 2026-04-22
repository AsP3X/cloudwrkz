// Human: Per job-type budgets cap parallel runs and optional minimum gaps so expensive handlers cannot stampede the database or upstream APIs.
// Agent: TypeBudgets HOLDS Mutex map of in_flight + last_job_started; try_acquire/release mutate counts; BudgetReleaseOnDrop decrements on Drop.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use super::JobTypePolicy;

#[derive(Default)]
struct TypeState {
    in_flight: u32,
    last_job_started: Option<Instant>,
}

pub struct TypeBudgets {
    configs: HashMap<String, JobTypePolicy>,
    state: Mutex<HashMap<String, TypeState>>,
}

/// Releases one acquired slot for `job_type` when dropped (e.g. after a spawned job finishes or panics).
pub(crate) struct BudgetReleaseOnDrop {
    budgets: Arc<TypeBudgets>,
    job_type: String,
}

impl BudgetReleaseOnDrop {
    pub(crate) fn new(budgets: Arc<TypeBudgets>, job_type: String) -> Self {
        Self { budgets, job_type }
    }
}

impl Drop for BudgetReleaseOnDrop {
    // Human: RAII ties the in-flight increment from `try_acquire` to the actual duration of the spawned worker task.
    // Agent: drop CALLS TypeBudgets::release for stored job_type string.

    fn drop(&mut self) {
        self.budgets.release(&self.job_type);
    }
}

impl TypeBudgets {
    // Human: Constructed once per process from `policies_from_config` so dispatcher loops share one mutex-backed counter map.
    // Agent: STORES configs HashMap + empty Mutex<HashMap<String, TypeState>>.

    pub fn new(configs: HashMap<String, JobTypePolicy>) -> Self {
        Self {
            configs,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Try to reserve a slot for this job type (non-blocking). Returns false if limits block.
    // Human: A `max_concurrent` of zero would deadlock every claim, so we clamp to at least one in-flight slot.
    // Agent: LOCKS state mutex; COMPARES in_flight to cfg.max_concurrent.max(1); CHECKS min_interval_between_starts vs last_job_started; MAY increment in_flight.

    pub fn try_acquire(&self, job_type: &str) -> bool {
        let cfg = self.configs.get(job_type).cloned().unwrap_or_default();
        // `max_concurrent == 0` would make `in_flight >= 0` true immediately and permanently
        // starve that job type (rows flip pending → processing → pending forever, started_at stays null).
        let max_concurrent = cfg.max_concurrent.max(1);
        let mut map = self.state.lock().expect("job budget mutex poisoned");
        let s = map.entry(job_type.to_string()).or_default();
        if s.in_flight >= max_concurrent {
            return false;
        }
        if let Some(min_gap) = cfg.min_interval_between_starts {
            if let Some(prev) = s.last_job_started {
                if prev.elapsed() < min_gap {
                    return false;
                }
            }
        }
        s.in_flight += 1;
        s.last_job_started = Some(Instant::now());
        true
    }

    // Human: When a job task ends (success, fail, panic path) the slot must return so another job of that type can start.
    // Agent: LOCKS mutex; SATURATING_SUB in_flight for job_type key if present.

    pub fn release(&self, job_type: &str) {
        let mut map = self.state.lock().expect("job budget mutex poisoned");
        if let Some(s) = map.get_mut(job_type) {
            s.in_flight = s.in_flight.saturating_sub(1);
        }
    }
}
