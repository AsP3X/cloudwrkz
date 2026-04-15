-- Earliest time the worker may claim a pending job (GitHub pacing vs enqueue delay).
ALTER TABLE background_jobs
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ;

COMMENT ON COLUMN background_jobs.run_after IS
  'If set on a pending job, the global worker will not claim it until now() >= run_after. NULL means eligible immediately.';

CREATE INDEX IF NOT EXISTS idx_background_jobs_pending_run_after
  ON background_jobs (status, run_after, priority DESC, created_at ASC)
  WHERE status = 'pending';
