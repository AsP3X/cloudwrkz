-- Queued GitHub metadata enrichment (rate-limited worker; avoids client-side GitHub API abuse).
CREATE TABLE IF NOT EXISTS link_github_metadata_jobs (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lgmj_pending_created
  ON link_github_metadata_jobs (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lgmj_link_status
  ON link_github_metadata_jobs (link_id, status, created_at DESC);
