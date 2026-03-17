"use client";

import { useEffect, useRef } from "react";

/** Interval (ms) to ping the server to prevent proxy idle timeouts (502). Keep under typical 60s proxy timeout. */
const KEEP_ALIVE_INTERVAL_MS = 45_000;

/** Request timeout so a slow response doesn't block the next ping. */
const PING_TIMEOUT_MS = 5_000;

/**
 * Periodically pings the server so reverse proxy / load balancer connections
 * stay alive. Prevents 502 Bad Gateway after a few minutes of inactivity.
 */
export function KeepAliveProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const SERVER_UNAVAILABLE_EVENT = "serverunavailable";

    const dispatchServerUnavailable = (reason: unknown) => {
      try {
        (window as unknown as { __serverUnavailableReason?: unknown }).__serverUnavailableReason = reason;
        window.dispatchEvent(new CustomEvent(SERVER_UNAVAILABLE_EVENT, { detail: reason }));
      } catch {
        // ignore
      }
    };

    const ping = () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      fetch("/api/ping", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => {
          // Proxy returns 502 when upstream (Next.js) is down; show server-unavailable UI
          if (!response.ok) {
            const err = new Error(response.statusText || `HTTP ${response.status}`) as Error & { status?: number };
            err.status = response.status;
            dispatchServerUnavailable(err);
          }
        })
        .catch(() => {
          // Network error or abort; dispatch so UI shows server unavailable (e.g. server killed)
          const err = new Error("Failed to fetch") as Error & { status?: number };
          err.status = 502;
          dispatchServerUnavailable(err);
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    };

    // Ping immediately when tab becomes visible (in case connection was closed while hidden)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        ping();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Regular interval to keep connection alive (under typical 60s proxy timeout)
    intervalRef.current = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
    ping();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}
