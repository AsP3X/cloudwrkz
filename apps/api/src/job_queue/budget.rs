use std::collections::HashMap;
use std::sync::Mutex;
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

impl TypeBudgets {
    pub fn new(configs: HashMap<String, JobTypePolicy>) -> Self {
        Self {
            configs,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Try to reserve a slot for this job type (non-blocking). Returns false if limits block.
    pub fn try_acquire(&self, job_type: &str) -> bool {
        let cfg = self.configs.get(job_type).cloned().unwrap_or_default();
        let mut map = self.state.lock().expect("job budget mutex poisoned");
        let s = map.entry(job_type.to_string()).or_default();
        if s.in_flight >= cfg.max_concurrent {
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

    pub fn release(&self, job_type: &str) {
        let mut map = self.state.lock().expect("job budget mutex poisoned");
        if let Some(s) = map.get_mut(job_type) {
            s.in_flight = s.in_flight.saturating_sub(1);
        }
    }
}
