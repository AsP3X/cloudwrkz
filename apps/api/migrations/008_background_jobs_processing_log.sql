-- Persist per-job debug lines for the admin Jobs detail dialog (survives API restarts).

ALTER TABLE background_jobs
  ADD COLUMN IF NOT EXISTS processing_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN background_jobs.processing_log IS
  'Timestamped debug lines appended while the job runs; shown in Admin → Jobs live log panel.';
