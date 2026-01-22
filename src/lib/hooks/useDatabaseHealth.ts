"use client";

import { useState, useEffect, useCallback, useContext } from "react";
import { DatabaseHealthContext } from "@/components/providers/DatabaseHealthProvider";

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
  pollInterval?: number; // Polling interval in milliseconds (default: 30000)
  initialStatus?: DatabaseHealthStatus; // Initial status from server
  onStatusChange?: (status: DatabaseHealthStatus, wasUnhealthy: boolean) => void; // Callback when status changes
}) {
  const {
    pollInterval = 60000, // Default to 60 seconds (less frequent)
    initialStatus = "loading",
    onStatusChange,
  } = options || {};

  // Always read context first – hooks must not be conditional
  const context = useContext(DatabaseHealthContext);

  // Local polling state is only used when no provider is available
  const [status, setStatus] = useState<DatabaseHealthStatus>(initialStatus);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isServerUnreachable, setIsServerUnreachable] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(true);

  const checkHealth = useCallback(async () => {
    // Add timeout to prevent hanging when database is unreachable
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      // Use Promise.resolve to ensure errors are caught in our try-catch
      const response = await Promise.resolve(
        fetch("/api/health", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        })
      ).catch((fetchErr) => {
        // Re-throw to be caught by outer catch, but clear timeout first
        clearTimeout(timeoutId);
        throw fetchErr;
      });
      
      clearTimeout(timeoutId);

      // Try to parse the response even if status is not OK (e.g., 503)
      // The API still returns health data in the body even when unhealthy
      let data: HealthCheckResponse;
      try {
        data = await response.json();
      } catch (parseError) {
        // If we can't parse the response, treat it as an error
        throw new Error(`Failed to parse health check response: ${response.status} ${response.statusText}`);
      }

      const newStatus = data.services?.database?.status || "unhealthy";
      const newConnected = data.services?.database?.connected ?? false;

      setLastChecked(new Date(data.timestamp || new Date().toISOString()));
      setError(data.services?.database?.error || null);
      // Server is reachable if we got a response (even if unhealthy)
      setIsServerUnreachable(false);

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
      // Clear timeout in case of error
      // Check if this is a server unreachable error (fetch failed completely)
      const isServerError = err instanceof Error && (
        err.name === "TypeError" && err.message.includes("fetch") ||
        err.name === "AbortError" ||
        err.message.toLowerCase().includes("network") ||
        err.message.toLowerCase().includes("failed to fetch")
      );
      
      setIsServerUnreachable(isServerError);
      
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout error - server is likely unreachable
        setError("Server is unreachable - request timed out");
      } else if (isServerError) {
        // Server unreachable error takes priority
        setError("Server is unreachable - unable to connect to the service");
      } else {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
      }
      setStatus("unhealthy");
      setIsConnected(false);
      setLastChecked(new Date());
    }
  }, [onStatusChange]);

  useEffect(() => {
    // When a provider is present, we rely entirely on its state and
    // skip local polling logic to avoid duplicate network traffic.
    if (context) {
      return;
    }

    // Initial check - wrap to prevent unhandled promise rejection
    checkHealth().catch(() => {
      // Errors are already handled inside checkHealth
      // This catch prevents unhandled promise rejection warnings
    });

    // Listen for online/offline events to detect connection loss immediately
    const handleOnline = () => {
      // When connection is restored, check health immediately
      checkHealth().catch(() => {});
    };

    const handleOffline = () => {
      // When connection is lost, immediately mark as unhealthy
      setStatus("unhealthy");
      setIsConnected(false);
      setIsServerUnreachable(true);
      setError("Network connection lost");
      setLastChecked(new Date());
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    // Set up polling interval
    // Use longer intervals to reduce server load and prevent spam
    let interval: NodeJS.Timeout | null = null;
    if (isPolling) {
      interval = setInterval(() => {
        checkHealth().catch(() => {
          // Errors are already handled inside checkHealth
          // This catch prevents unhandled promise rejection warnings
        });
      }, pollInterval);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [checkHealth, pollInterval, isPolling, context]);

  // Expose manual refresh function
  const refresh = useCallback(() => {
    checkHealth();
  }, [checkHealth]);

  // Pause/resume polling
  const pausePolling = useCallback(() => {
    // Polling is controlled by the provider when context exists
    if (context) return;
    setIsPolling(false);
  }, [context]);

  const resumePolling = useCallback(() => {
    if (context) return;
    setIsPolling(true);
  }, [context]);

  // If we have a provider, always prefer its state so callers get a
  // single, shared source of truth for database health.
  if (context) {
    return {
      status: context.status,
      isConnected: context.isConnected,
      lastChecked: context.lastChecked,
      error: context.error,
      isServerUnreachable: context.isServerUnreachable,
      refresh,
      pausePolling,
      resumePolling,
      isPolling: false,
    };
  }

  return {
    status,
    isConnected,
    lastChecked,
    error,
    isServerUnreachable,
    refresh,
    pausePolling,
    resumePolling,
    isPolling,
  };
}
