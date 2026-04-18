-- Tracks when a user opens a search result so ranking can boost frequently used hits.
CREATE TABLE IF NOT EXISTS search_result_accesses (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_access_user_entity_time
  ON search_result_accesses (user_id, entity_type, entity_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_access_user_time
  ON search_result_accesses (user_id, accessed_at DESC);

COMMENT ON TABLE search_result_accesses IS 'Per-user opens of search results; used to boost ranking within a sliding window.';
