//! Tracks in-flight background job tasks so administrators can abort `processing` rows.

// Human: Each spawned job task registers an `AbortHandle` keyed by job id; admin stop aborts the task after marking the row cancelled.
// Agent: Mutex HashMap job_id→AbortHandle; register on spawn; unregister on task end; abort(job_id) CALLS AbortHandle::abort.

use std::collections::HashMap;
use std::sync::Mutex;

use tokio::task::AbortHandle;

pub struct JobRunRegistry {
    abort_by_job_id: Mutex<HashMap<String, AbortHandle>>,
}

impl JobRunRegistry {
    pub fn new() -> Self {
        Self {
            abort_by_job_id: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, job_id: &str, abort: AbortHandle) {
        if let Ok(mut map) = self.abort_by_job_id.lock() {
            map.insert(job_id.to_string(), abort);
        }
    }

    pub fn unregister(&self, job_id: &str) {
        if let Ok(mut map) = self.abort_by_job_id.lock() {
            map.remove(job_id);
        }
    }

    /// Returns true when an in-process task was aborted.
    pub fn abort(&self, job_id: &str) -> bool {
        if let Ok(map) = self.abort_by_job_id.lock() {
            if let Some(handle) = map.get(job_id) {
                handle.abort();
                return true;
            }
        }
        false
    }
}
