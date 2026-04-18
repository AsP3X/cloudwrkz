-- Per-request HTTP telemetry for anomaly detection and traffic analysis (not user audit).
CREATE TABLE IF NOT EXISTS http_request_logs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_string TEXT,
  status_code SMALLINT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  client_ip TEXT,
  user_agent TEXT,
  category TEXT NOT NULL,
  outcome TEXT NOT NULL,
  client_class TEXT NOT NULL,
  anomaly_signals JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_occurred_at
  ON http_request_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_category_time
  ON http_request_logs (category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_outcome_time
  ON http_request_logs (outcome, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_client_class_time
  ON http_request_logs (client_class, occurred_at DESC);

COMMENT ON TABLE http_request_logs IS 'Classified HTTP access log for security analytics; written async after each response.';
