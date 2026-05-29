-- Jobs that were claimed but never started a handler within the stall threshold use status `stalling`.
-- Workers reclaim stalling rows before ordinary pending work.

ALTER TABLE background_jobs
  DROP CONSTRAINT IF EXISTS background_jobs_status_check;

ALTER TABLE background_jobs
  ADD CONSTRAINT background_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'stalling', 'completed', 'failed', 'cancelled'));

COMMENT ON COLUMN background_jobs.status IS
  'pending=queued; processing=handler running; stalling=claimed but handler never started (awaiting reclaim); completed/failed/cancelled=terminal';

DROP INDEX IF EXISTS idx_background_jobs_queue;

CREATE INDEX idx_background_jobs_queue
  ON background_jobs (status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'stalling');

DROP INDEX IF EXISTS idx_background_jobs_pending_run_after;

CREATE INDEX idx_background_jobs_pending_run_after
  ON background_jobs (status, run_after, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'stalling');
