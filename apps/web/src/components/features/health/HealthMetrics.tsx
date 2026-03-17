"use client";

import { useState, useEffect, useCallback } from "react";
import type { DatabaseHealthStatus } from "@/lib/utils/db-health";
import { formatDateTimeFull, formatTime } from "@/lib/utils/date";
import dynamic from "next/dynamic";
import type { LineProps } from "recharts";
const LineChart = dynamic(() => import("recharts").then(mod => ({ default: mod.LineChart })), { ssr: false });
const Line = dynamic(() => import("recharts").then(mod => ({ default: mod.Line })), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(mod => ({ default: mod.XAxis })), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(mod => ({ default: mod.YAxis })), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(mod => ({ default: mod.ResponsiveContainer })), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(mod => ({ default: mod.Tooltip })), { ssr: false });
const Area = dynamic(() => import("recharts").then(mod => ({ default: mod.Area })), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then(mod => ({ default: mod.AreaChart })), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(mod => ({ default: mod.CartesianGrid })), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then(mod => ({ default: mod.ReferenceLine })), { ssr: false });
const ComposedChart = dynamic(() => import("recharts").then(mod => ({ default: mod.ComposedChart })), { ssr: false });
const Cell = dynamic(() => import("recharts").then(mod => ({ default: mod.Cell })), { ssr: false });

interface HealthMetricsProps {
  initialDbHealth: DatabaseHealthStatus;
  isAuthenticated?: boolean;
}

function StatusBadge({ status }: { status: "healthy" | "unhealthy" | "degraded" }) {
  const colors = {
    healthy: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    degraded: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
    unhealthy: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  };

  const icons = {
    healthy: "✓",
    degraded: "⚠",
    unhealthy: "✗",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-all duration-500 ease-in-out ${colors[status]}`}
    >
      <span>{icons[status]}</span>
      <span className="capitalize">{status}</span>
    </span>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  progress,
  backgroundChart,
}: {
  title: string;
  value: string | number | undefined;
  subtitle?: string;
  icon?: React.ReactNode;
  progress?: number; // Progress from 0 to 100
  backgroundChart?: React.ReactNode; // Optional chart as background
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-300 relative overflow-hidden" style={{ minHeight: backgroundChart ? '160px' : '140px' }}>
      {/* Progress bar background - fills entire card with gradient */}
      {progress !== undefined && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-primary-200 via-primary-100 to-secondary-200 dark:from-primary-900/30 dark:via-primary-800/20 dark:to-secondary-900/30 transition-all duration-1000 ease-linear pointer-events-none"
          style={{ 
            width: `${progress}%`,
          }}
        />
      )}
      {/* Background chart */}
      {backgroundChart && (
        <div className="absolute inset-0 pointer-events-none z-0" style={{ opacity: 0.35, height: '100%', width: '100%' }}>
          {backgroundChart}
        </div>
      )}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            {title}
          </h3>
          {icon && (
            <div className="text-primary-600 dark:text-primary-400">
              {icon}
            </div>
          )}
        </div>
        <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          {value ?? "N/A"}
        </p>
        {subtitle && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Client component that displays and auto-updates health metrics
 */
const HEALTH_CHECK_INTERVAL = 30000; // 30 second
const MAX_DATA_POINTS = 50; // Maximum number of data points to display

export function HealthMetrics({ initialDbHealth, isAuthenticated = false }: HealthMetricsProps) {
  const [dbHealthState, setDbHealth] = useState<DatabaseHealthStatus | null>(null);
  const dbHealth = dbHealthState ?? initialDbHealth;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [pageResponseTimeHistory, setPageResponseTimeHistory] = useState<Array<{ time: string; timestamp: number; responseTime: number }>>([]);
  const [databaseResponseTimeHistory, setDatabaseResponseTimeHistory] = useState<Array<{ time: string; timestamp: number; responseTime: number }>>([]);

  // Initialize client-side only values after mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    const now = Date.now();
    setLastFetchTime(now);
    
    // Initialize with initial database response time if available (only on client)
    if (initialDbHealth.responseTime !== undefined && 
        initialDbHealth.responseTime !== null &&
        typeof initialDbHealth.responseTime === 'number' &&
        !isNaN(initialDbHealth.responseTime) &&
        isFinite(initialDbHealth.responseTime)) {
      setDatabaseResponseTimeHistory([{
        time: formatTime(new Date()),
        timestamp: now,
        responseTime: initialDbHealth.responseTime,
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get the most recent data points (page response time)
  const visibleData = pageResponseTimeHistory.slice(-MAX_DATA_POINTS);
  
  // Helper function to get color based on response time
  const getResponseTimeColor = (value: number): string => {
    if (value > 1000) return "#ef4444"; // red-500
    if (value > 500) return "#eab308"; // yellow-500
    return "#22c55e"; // green-500
  };

  // Create separate data series for color coding
  const colorCodedData = visibleData.map(entry => ({
    ...entry,
    fast: entry.responseTime < 500 ? entry.responseTime : null,
    moderate: entry.responseTime >= 500 && entry.responseTime <= 1000 ? entry.responseTime : null,
    slow: entry.responseTime > 1000 ? entry.responseTime : null,
  }));
  
  // Ensure colorCodedData is always defined (fallback to empty array)
  const chartData = colorCodedData || [];
  
  // Get the most recent database response time data points
  const visibleDatabaseData = databaseResponseTimeHistory.slice(-MAX_DATA_POINTS);

  // Calculate dynamic Y-axis domain based on max value (for page response time)
  const yAxisDomain = (() => {
    if (visibleData.length === 0) return [0, 200] as [number, number];
    
    const maxValue = Math.max(...visibleData.map(d => d.responseTime));
    // Use the exact max value recorded
    return [0, maxValue] as [number, number];
  })();

  // Calculate dynamic Y-axis domain for database response time
  const databaseYAxisDomain = (() => {
    if (visibleDatabaseData.length === 0) return [0, 200] as [number, number];
    
    const maxValue = Math.max(...visibleDatabaseData.map(d => d.responseTime));
    // Use the exact max value recorded, ensure minimum of 10 for very small values
    return [0, Math.max(maxValue, 10)] as [number, number];
  })();

  // Get current page response time (latest entry)
  const currentPageResponseTime = pageResponseTimeHistory.length > 0 
    ? pageResponseTimeHistory[pageResponseTimeHistory.length - 1].responseTime 
    : undefined;

  const fetchHealthData = useCallback(async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    // Add timeout to prevent hanging when database is unreachable
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      // Calculate page/server response time
      const pageResponseTime = Date.now() - startTime;

      // Proxy returns 502/503 when upstream server is down; don't try to parse (may be HTML error page)
      if (response.status === 502 || response.status === 503) {
        setDbHealth({
          status: "unhealthy",
          connected: false,
          responseTime: undefined,
          error: response.status === 502 ? "Server unavailable (502 Bad Gateway)" : "Service unavailable (503)",
          lastChecked: new Date(),
        });
        setIsRefreshing(false);
        return;
      }

      // Try to parse the response even if status is not OK (e.g., 503 from our API)
      // The API still returns health data in the body even when unhealthy
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        // If we can't parse the response, treat it as an error
        throw new Error(`Failed to parse health check response: ${response.status} ${response.statusText}`);
      }

      const dbData = data.services?.database || data.database || {};
      
      // Validate and sanitize response time - ensure it's a valid number
      const newResponseTime = typeof dbData.responseTime === 'number' && 
                              !isNaN(dbData.responseTime) && 
                              isFinite(dbData.responseTime) 
                              ? dbData.responseTime 
                              : undefined;
      
      // Update health status - use the data from the response even if status code is not 200
      setDbHealth({
        status: dbData.status || "unhealthy",
        connected: dbData.connected ?? false,
        responseTime: newResponseTime,
        error: dbData.error,
        activeConnections: dbData.activeConnections,
        maxConnections: dbData.maxConnections,
        droppedConnections: dbData.droppedConnections,
        databaseSize: dbData.databaseSize,
        lastChecked: dbData.lastChecked ? new Date(dbData.lastChecked) : new Date(),
      });

      // Update page response time history
      setPageResponseTimeHistory((prev) => {
        const newHistory = [
          ...prev,
          {
            time: formatTime(new Date()),
            timestamp: Date.now(),
            responseTime: pageResponseTime,
          },
        ];
        // Keep only the most recent entries
        return newHistory.slice(-MAX_DATA_POINTS);
      });

      // Update database response time history - only if we have a valid response time
      if (newResponseTime !== undefined && newResponseTime !== null) {
        setDatabaseResponseTimeHistory((prev) => {
          const newHistory = [
            ...prev,
            {
              time: formatTime(new Date()),
              timestamp: Date.now(),
              responseTime: newResponseTime,
            },
          ];
          // Keep only the most recent entries
          return newHistory.slice(-MAX_DATA_POINTS);
        });
      }
    } catch (err) {
      // Clear timeout in case of error
      clearTimeout(timeoutId);
      
      // Calculate page response time even on error
      const pageResponseTime = Date.now() - startTime;
      
      // Determine error message - prioritize server unreachable over database errors
      let errorMessage = "Failed to fetch health data";
      const isServerError = err instanceof Error && (
        err.name === "TypeError" && err.message.includes("fetch") ||
        err.name === "AbortError" ||
        err.message.toLowerCase().includes("network") ||
        err.message.toLowerCase().includes("failed to fetch")
      );
      
      if (err instanceof Error) {
        if (isServerError) {
          // Server unreachable error takes priority
          errorMessage = err.name === "AbortError"
            ? "Server is unreachable - request timed out"
            : "Server is unreachable - unable to connect to the service";
        } else {
          errorMessage = err.message;
        }
      }
      
      // Only log unexpected errors (not network failures which are expected when DB is down)
      if (err instanceof Error && err.name !== "AbortError" && err.name !== "TypeError") {
        console.error("Unexpected error fetching health data:", err);
      }
      
      // Update status to unhealthy on error
      setDbHealth((prev) => ({
        ...prev,
        status: "unhealthy",
        connected: false,
        error: errorMessage,
        lastChecked: new Date(),
      }));

      // Still record the response time (even if it's an error)
      setPageResponseTimeHistory((prev) => {
        const newHistory = [
          ...prev,
          {
            time: formatTime(new Date()),
            timestamp: Date.now(),
            responseTime: pageResponseTime,
          },
        ];
        return newHistory.slice(-MAX_DATA_POINTS);
      });
    } finally {
      setIsRefreshing(false);
      setLastFetchTime(Date.now());
      setProgress(0);
    }
  }, []);

  // Fetch health data immediately on mount and then auto-refresh every 30 seconds
  useEffect(() => {
    // Fetch immediately on first load - wrap to prevent unhandled promise rejection
    fetchHealthData().catch(() => {
      // Errors are already handled inside fetchHealthData
      // This catch prevents unhandled promise rejection warnings
    });
    
    // Then set up interval for subsequent fetches
    const interval = setInterval(() => {
      fetchHealthData().catch(() => {
        // Errors are already handled inside fetchHealthData
        // This catch prevents unhandled promise rejection warnings
      });
    }, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  // Update progress bar every second
  useEffect(() => {
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - lastFetchTime;
      const progressPercent = Math.min((elapsed / HEALTH_CHECK_INTERVAL) * 100, 100);
      setProgress(progressPercent);
    }, 1000);

    return () => clearInterval(progressInterval);
  }, [lastFetchTime]);



  const overallStatus =
    dbHealth.status === "healthy"
      ? "healthy"
      : dbHealth.status === "degraded"
      ? "degraded"
      : "unhealthy";

  return (
    <>
      {/* Overall Status Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Overall System Status
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Last checked: {formatDateTimeFull(dbHealth.lastChecked)}
              {isRefreshing && (
                <span className="ml-2 text-primary-600 dark:text-primary-400">
                  (updating...)
                </span>
              )}
            </p>
          </div>
          <StatusBadge status={overallStatus} />
        </div>
      </div>

      {/* Database Health Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Database
          </h2>
          <StatusBadge status={dbHealth.status} />
        </div>

        {dbHealth.error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">
                  Connection Error
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {dbHealth.error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <MetricCard
            title="Connection Status"
            value={dbHealth.connected ? "Connected" : "Disconnected"}
            progress={progress}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            }
          />
          <MetricCard
            title="Database Response Time"
            value={
              dbHealth.responseTime !== undefined && 
              dbHealth.responseTime !== null && 
              !isNaN(dbHealth.responseTime) && 
              isFinite(dbHealth.responseTime)
                ? `${dbHealth.responseTime}ms` 
                : "N/A"
            }
            subtitle={
              dbHealth.responseTime !== undefined && 
              dbHealth.responseTime !== null && 
              !isNaN(dbHealth.responseTime) && 
              isFinite(dbHealth.responseTime) &&
              dbHealth.responseTime > 1000
                ? "Slow response detected"
                : "Normal response time"
            }
            backgroundChart={
              databaseResponseTimeHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={visibleDatabaseData}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorDatabaseResponseTimeBackground" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      </linearGradient>
                    </defs>
                    <YAxis type="number" domain={databaseYAxisDomain} hide />
                    <Area
                      type="monotone"
                      dataKey="responseTime"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#colorDatabaseResponseTimeBackground)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : undefined
            }
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
          <MetricCard
            title="Active Connections"
            value={dbHealth.activeConnections ?? "N/A"}
            icon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            }
          />
          {isAuthenticated && (
            <>
              <MetricCard
                title="Database Size"
                value={dbHealth.databaseSize ?? "N/A"}
                icon={
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                    />
                  </svg>
                }
              />
              <MetricCard
                title="Max Connections"
                value={dbHealth.maxConnections ?? "N/A"}
                icon={
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                }
              />
              <MetricCard
                title="Dropped Connections"
                value={dbHealth.droppedConnections ?? "N/A"}
                icon={
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                }
              />
            </>
          )}
        </div>

        {/* Connection Usage Progress Bar - Only visible to authenticated users */}
        {isAuthenticated &&
          dbHealth.activeConnections !== undefined &&
          dbHealth.maxConnections !== undefined && (
            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                <span className="font-medium">Connection Usage</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {Math.round(
                    (dbHealth.activeConnections / dbHealth.maxConnections) * 100
                  )}
                  %
                </span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-500 ease-in-out"
                  style={{
                    width: `${
                      Math.min(
                        (dbHealth.activeConnections / dbHealth.maxConnections) *
                          100,
                        100
                      )}%`,
                    backgroundColor:
                      (dbHealth.activeConnections / dbHealth.maxConnections) * 100 > 80
                        ? "#ef4444" // red-500
                        : (dbHealth.activeConnections / dbHealth.maxConnections) * 100 > 60
                        ? "#eab308" // yellow-500
                        : "#22c55e", // green-500
                  }}
                />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                {dbHealth.activeConnections} of {dbHealth.maxConnections}{" "}
                connections in use
              </p>
            </div>
          )}
      </div>

      {/* Response Time Section with Graph Background */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 mb-8 relative overflow-hidden" style={{ minHeight: '200px' }}>
        {/* Background graph */}
        {pageResponseTimeHistory.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-0" style={{ opacity: 0.25 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorResponseTimeCardBackgroundGreen" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorResponseTimeCardBackgroundYellow" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorResponseTimeCardBackgroundRed" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <YAxis type="number" domain={yAxisDomain} hide />
                {/* Fast response times (< 500ms) - Green fill, blue line */}
                <Area
                  type="monotone"
                  dataKey="fast"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorResponseTimeCardBackgroundGreen)"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                  connectNulls
                />
                {/* Moderate response times (500-1000ms) - Yellow fill, blue line */}
                <Area
                  type="monotone"
                  dataKey="moderate"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorResponseTimeCardBackgroundYellow)"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                  connectNulls
                />
                {/* Slow response times (> 1000ms) - Red fill, blue line */}
                <Area
                  type="monotone"
                  dataKey="slow"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorResponseTimeCardBackgroundRed)"
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Page Response Time
            </h2>
            {currentPageResponseTime !== undefined && (
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Current: {currentPageResponseTime}ms
              </span>
            )}
          </div>

          {pageResponseTimeHistory.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
                  {currentPageResponseTime}ms
                </span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  average response time
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span>&lt; 500ms (Fast)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-yellow-500"></div>
                  <span>500-1000ms (Moderate)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500"></div>
                  <span>&gt; 1000ms (Slow)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-neutral-500 dark:text-neutral-400">
              <p>No response time data available yet. Data will appear after the first health check.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
