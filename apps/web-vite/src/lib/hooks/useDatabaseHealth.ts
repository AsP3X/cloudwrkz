// Human: Polls the public `/health` endpoint so the shell can warn when the API or database is unhealthy or unreachable.
// Agent: FETCH /health with credentialsForApiFetch; PARSES services.database; SETS status error isServerUnreachable; INTERVAL poll.

import { useState, useEffect, useCallback } from "react";
import { credentialsForApiFetch, getApiBaseUrl } from "@/lib/apiBaseUrl";

export type DatabaseHealthStatus = "healthy" | "degraded" | "unhealthy" | "loading";

export function useDatabaseHealth(options?: {
  pollInterval?: number;
  initialStatus?: DatabaseHealthStatus;
}) {
  const pollInterval = options?.pollInterval ?? 30000;
  const initialStatus = options?.initialStatus ?? "loading";

  const [status, setStatus] = useState<DatabaseHealthStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isServerUnreachable, setIsServerUnreachable] = useState(false);

  const checkHealth = useCallback(async () => {
    try {
      const API_BASE = getApiBaseUrl();
      const healthUrl = `${API_BASE}/health`;
      const res = await fetch(healthUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        credentials: credentialsForApiFetch(healthUrl),
      });
      const data = await res.json().catch(() => ({}));

      const db = data?.services?.database ?? data?.database;
      if (db && typeof db === "object" && "connected" in db) {
        const connected = db.connected === true;
        const dbStatus = typeof db.status === "string" ? db.status : "";
        const newStatus: DatabaseHealthStatus = connected
          ? dbStatus === "degraded"
            ? "degraded"
            : "healthy"
          : "unhealthy";
        setStatus(newStatus);
        setError(typeof db.error === "string" ? db.error : null);
        // API responded with structured health — HTTP 503 here means DB check failed, not "API down".
        setIsServerUnreachable(false);
        return;
      }

      if (res.status === 502 || res.status === 503) {
        const message =
          data?.error?.message ||
          (res.status === 502
            ? "Gateway could not reach the API (or the API returned an error)."
            : "Service unavailable — the API may be starting or overloaded.");
        setIsServerUnreachable(true);
        setError(message);
        setStatus("unhealthy");
        return;
      }

      const connected = Boolean(db?.connected ?? (res.ok && !!data));
      const raw = typeof db?.status === "string" ? db.status : "";
      const newStatus: DatabaseHealthStatus = connected
        ? raw === "degraded"
          ? "degraded"
          : "healthy"
        : "unhealthy";
      setStatus(newStatus);
      setError(typeof db?.error === "string" ? db.error : null);
      setIsServerUnreachable(false);
    } catch (err) {
      setIsServerUnreachable(true);
      setError("Unable to reach the API (network error or connection refused).");
      setStatus("unhealthy");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, pollInterval);
    return () => clearInterval(id);
  }, [checkHealth, pollInterval]);

  return { status, error, isServerUnreachable, isConnected: status === "healthy" || status === "degraded", checkHealth };
}
