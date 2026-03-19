/** Mirrors `apps/api/src/routes/health.rs` health JSON (v1 + legacy). */

export interface HealthLoadAverage {
  one: number;
  five: number;
  fifteen: number;
}

export interface HealthDiskAggregate {
  total_bytes: number;
  available_bytes: number;
}

export interface HealthHost {
  memory_total_bytes: number;
  memory_used_bytes: number;
  memory_available_bytes?: number;
  load_average?: HealthLoadAverage;
  disks?: HealthDiskAggregate;
}

export interface HealthDatabase {
  status: string;
  connected: boolean;
  response_time_ms?: number;
  pool_size: number;
  pool_connections_idle: number;
  error?: string;
}

export interface HealthProcess {
  os: string;
  arch: string;
  pid: number;
  cpu_usage_percent?: number;
}

export interface HealthApiMeta {
  name: string;
  version: string;
  environment: string;
  uptime_seconds: number;
  /** Reported API nodes available (single endpoint → 1 until multi-region). */
  nodes_available?: number;
  /** Deployment region (API_REGION or --region). */
  region?: string;
  hostname?: string;
}

export interface HealthServices {
  database: HealthDatabase;
  process: HealthProcess;
}

export interface HealthPayload {
  status: string;
  timestamp: string;
  api: HealthApiMeta;
  services: HealthServices;
  host?: HealthHost;
}
