import { useState, useEffect, useCallback } from "react";

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
      const API_BASE = import.meta.env.DEV ? "/api/v1" : (import.meta.env.VITE_API_URL || "/api/v1");
      const res = await fetch(`${API_BASE}/health`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (res.status === 502 || res.status === 503) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.error?.message ||
          (res.status === 502
            ? "Backend is temporarily unavailable."
            : "Backend is currently unreachable.");
        setIsServerUnreachable(true);
        setError(message);
        setStatus("unhealthy");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const db = data?.services?.database ?? data?.database;
      const connected = db?.connected ?? (res.ok && !!data);
      const newStatus = connected ? (db?.status || "healthy") : "unhealthy";
      setStatus(newStatus);
      setError(db?.error ?? null);
      setIsServerUnreachable(false);
    } catch (err) {
      setIsServerUnreachable(true);
      setError("Unable to reach backend service.");
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
