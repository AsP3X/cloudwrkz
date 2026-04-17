-- Global background job queue (extensible per job_type; replaces link_github_metadata_jobs).

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority SMALLINT NOT NULL DEFAULT 0,
  dedupe_key TEXT,
  error_message TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue
  ON background_jobs (status, priority DESC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status
  ON background_jobs (job_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_dedupe
  ON background_jobs (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Migrate legacy GitHub link metadata jobs (only if 006 created the old table).
DO $$
BEGIN
  IF to_regclass('public.link_github_metadata_jobs') IS NOT NULL THEN
    INSERT INTO background_jobs (
      id,
      job_type,
      payload,
      status,
      error_message,
      created_by_user_id,
      created_at,
      updated_at,
      started_at,
      completed_at,
      dedupe_key
    )
    SELECT
      j.id,
      'github_link_metadata',
      jsonb_build_object('link_id', j.link_id),
      CASE
        WHEN j.status = 'processing' THEN 'pending'
        ELSE j.status
      END,
      j.error_message,
      j.user_id,
      j.created_at::timestamptz,
      j.updated_at::timestamptz,
      NULL::timestamptz,
      j.completed_at::timestamptz,
      'github_link_metadata:' || j.link_id
    FROM link_github_metadata_jobs j
    WHERE NOT EXISTS (SELECT 1 FROM background_jobs b WHERE b.id = j.id);

    DROP TABLE link_github_metadata_jobs;
  END IF;
END $$;
