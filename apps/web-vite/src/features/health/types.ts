/** Public `GET …/health` and `GET /api/health` JSON — dashboard fields only (no host, process, or timings). */

/** `GET …/ping` — no database access; `server_processing_ms` is time inside the API process only. */
export interface PingPayload {
  ok: boolean;
  server_processing_ms?: number;
}

export interface HealthDatabase {
  status: string;
  connected: boolean;
  response_time_ms?: number;
  pool_size: number;
  pool_connections_idle: number;
  error?: string;
}

export interface HealthApiMeta {
  version: string;
  environment: string;
  uptime_seconds: number;
  /** Reported API nodes available (single endpoint → 1 until multi-region). */
  nodes_available?: number;
  /** Deployment region (API_REGION or --region). */
  region?: string;
}

export interface HealthServices {
  database: HealthDatabase;
}

export interface HealthPayload {
  status: string;
  timestamp: string;
  api: HealthApiMeta;
  services: HealthServices;
}
