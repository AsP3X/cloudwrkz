"use client";

import { useState, useEffect, useCallback } from "react";

export type DatabaseHealthStatus = "healthy" | "degraded" | "unhealthy" | "loading";

interface HealthCheckResponse {
  status: DatabaseHealthStatus;
  timestamp: string;
  services: {
    database: {
      status: DatabaseHealthStatus;
      connected: boolean;
      responseTime?: number;
      error?: string;
    };
  };
}

/**
 * Hook to monitor database health status in real-time
 * Automatically polls the health endpoint and updates when database status changes
 */
export function useDatabaseHealth(options?: {
  pollInterval?: number; // Polling interval in milliseconds (default: 10000)
  initialStatus?: DatabaseHealthStatus; // Initial status from server
  onStatusChange?: (status: DatabaseHealthStatus, wasUnhealthy: boolean) => void; // Callback when status changes
}) {
  const {
    pollInterval = 10000,
    initialStatus = "loading",
    onStatusChange,
  } = options || {};

  const [status, setStatus] = useState<DatabaseHealthStatus>(initialStatus);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data: HealthCheckResponse = await response.json();
      const newStatus = data.services.database.status;
      const newConnected = data.services.database.connected;

      setLastChecked(new Date(data.timestamp));
      setError(data.services.database.error || null);

      // Only update if status actually changed
      setStatus((prevStatus) => {
        if (prevStatus !== newStatus) {
          const wasUnhealthy = prevStatus === "unhealthy" || prevStatus === "loading";
          onStatusChange?.(newStatus, wasUnhealthy);
          return newStatus;
        }
        return prevStatus;
      });

      setIsConnected(newConnected);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setStatus("unhealthy");
      setIsConnected(false);
      setLastChecked(new Date());
    }
  }, [onStatusChange]);

  useEffect(() => {
    // Initial check
    checkHealth();

    // Set up polling interval
    if (isPolling) {
      const interval = setInterval(checkHealth, pollInterval);
      return () => clearInterval(interval);
    }
  }, [checkHealth, pollInterval, isPolling]);

  // Expose manual refresh function
  const refresh = useCallback(() => {
    checkHealth();
  }, [checkHealth]);

  // Pause/resume polling
  const pausePolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  const resumePolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  return {
    status,
    isConnected,
    lastChecked,
    error,
    refresh,
    pausePolling,
    resumePolling,
    isPolling,
  };
}
