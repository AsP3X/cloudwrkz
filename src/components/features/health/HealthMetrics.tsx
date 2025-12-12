"use client";

import { useState, useEffect } from "react";
import type { DatabaseHealthStatus } from "@/lib/utils/db-health";
import { formatDateTimeFull } from "@/lib/utils/date";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart, CartesianGrid, ReferenceLine, ComposedChart, Cell, LineProps } from "recharts";

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
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_DATA_POINTS = 50; // Maximum number of data points to display
const MAX_TIME_WINDOW_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

export function HealthMetrics({ initialDbHealth, isAuthenticated = false }: HealthMetricsProps) {
  const [dbHealth, setDbHealth] = useState(initialDbHealth);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now());
  const [progress, setProgress] = useState<number>(0);
  const [pageResponseTimeHistory, setPageResponseTimeHistory] = useState<Array<{ time: string; timestamp: number; responseTime: number }>>([]);
  const [databaseResponseTimeHistory, setDatabaseResponseTimeHistory] = useState<Array<{ time: string; timestamp: number; responseTime: number }>>(() => {
    // Initialize with initial database response time if available and valid
    if (initialDbHealth.responseTime !== undefined && 
        initialDbHealth.responseTime !== null &&
        typeof initialDbHealth.responseTime === 'number' &&
        !isNaN(initialDbHealth.responseTime) &&
        isFinite(initialDbHealth.responseTime)) {
      const now = Date.now();
      return [{
        time: new Date().toLocaleTimeString(),
        timestamp: now,
        responseTime: initialDbHealth.responseTime,
      }];
    }
    return [];
  });

  // Filter data to only show entries from the last 10 minutes
  const now = Date.now();
  const tenMinutesAgo = now - MAX_TIME_WINDOW_MS;
  
  // Helper function to validate response time values
  const isValidResponseTime = (val: number): boolean => {
    return typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= 0;
  };
  
  // Get the most recent data points within the 10-minute window (page response time)
  // Also filter out any invalid values that might have been stored previously
  const visibleData = pageResponseTimeHistory
    .filter(entry => entry.timestamp >= tenMinutesAgo && isValidResponseTime(entry.responseTime))
    .slice(-MAX_DATA_POINTS);
  
  // Helper function to get color based on response time
  const getResponseTimeColor = (value: number): string => {
    if (value > 1000) return "#ef4444"; // red-500
    if (value > 500) return "#eab308"; // yellow-500
    return "#22c55e"; // green-500
  };

  // Create segments with gradient transitions that start at threshold crossings
  const createColorSegments = () => {
    if (visibleData.length === 0) return [];
    
    const segments: Array<{ 
      data: typeof visibleData; 
      color: string; 
      dataKey: string;
      gradientId: string;
      isGradient?: boolean;
      fromColor?: string;
      toColor?: string;
    }> = [];
    
    let segmentStart = 0;
    let currentColor = getResponseTimeColor(visibleData[0].responseTime);
    let gradientIndex = 0;
    
    visibleData.forEach((entry, index) => {
      const entryColor = getResponseTimeColor(entry.responseTime);
      const isLast = index === visibleData.length - 1;
      const isFirst = index === 0;
      
      // Check if color changed (threshold crossed)
      if (entryColor !== currentColor && !isFirst) {
        // Create solid color segment up to the point where threshold was crossed
        const segmentData = visibleData.slice(segmentStart, index);
        if (segmentData.length > 0) {
          const segmentIndex = segments.length;
          const dataKey = `segment-${segmentIndex}`;
          const gradientId = 
            currentColor === "#22c55e" ? "colorResponseTimeCardBackgroundGreen" :
            currentColor === "#eab308" ? "colorResponseTimeCardBackgroundYellow" :
            "colorResponseTimeCardBackgroundRed";
          
          segments.push({
            data: segmentData,
            color: currentColor,
            dataKey,
            gradientId,
          });
        }
        
        // Create gradient transition segment: starts at threshold crossing point, ends at next point
        // This creates a smooth transition from the color at index-1 to the color at index
        const prevEntry = visibleData[index - 1];
        const transitionData = [prevEntry, entry]; // Start point (old color) to end point (new color)
        
        if (transitionData.length === 2) {
          const gradientDataKey = `gradient-${gradientIndex}`;
          const gradientId = `gradient-${gradientIndex}`;
          
          // Get the actual colors at the start and end points
          const fromColor = getResponseTimeColor(prevEntry.responseTime);
          const toColor = getResponseTimeColor(entry.responseTime);
          
          segments.push({
            data: transitionData,
            color: fromColor, // Will use gradient instead
            dataKey: gradientDataKey,
            gradientId,
            isGradient: true,
            fromColor: fromColor,
            toColor: toColor,
          });
          
          gradientIndex++;
        }
        
        segmentStart = index;
        currentColor = entryColor;
      } else if (isLast) {
        // Create final segment from last segment start to end
        const segmentData = visibleData.slice(segmentStart, index + 1);
        if (segmentData.length > 0) {
          const segmentIndex = segments.length;
          const dataKey = `segment-${segmentIndex}`;
          const gradientId = 
            currentColor === "#22c55e" ? "colorResponseTimeCardBackgroundGreen" :
            currentColor === "#eab308" ? "colorResponseTimeCardBackgroundYellow" :
            "colorResponseTimeCardBackgroundRed";
          
          segments.push({
            data: segmentData,
            color: currentColor,
            dataKey,
            gradientId,
          });
        }
      }
    });
    
    // If no color changes occurred, create a single segment
    if (segments.length === 0 && visibleData.length > 0) {
      const gradientId = 
        currentColor === "#22c55e" ? "colorResponseTimeCardBackgroundGreen" :
        currentColor === "#eab308" ? "colorResponseTimeCardBackgroundYellow" :
        "colorResponseTimeCardBackgroundRed";
      
      segments.push({
        data: visibleData,
        color: currentColor,
        dataKey: "segment-0",
        gradientId,
      });
    }
    
    return segments;
  };
  
  const colorSegments = createColorSegments();
  
  // Create a combined data object with all segment data keys
  const combinedData = visibleData.map((entry) => {
    const dataPoint: any = { ...entry };
    colorSegments.forEach(segment => {
      const isInSegment = segment.data.some(segEntry => 
        segEntry.timestamp === entry.timestamp
      );
      dataPoint[segment.dataKey] = isInSegment ? entry.responseTime : null;
    });
    return dataPoint;
  });
  
  // Get the most recent database response time data points within the 10-minute window
  // Also filter out any invalid values that might have been stored previously
  const visibleDatabaseData = databaseResponseTimeHistory
    .filter(entry => entry.timestamp >= tenMinutesAgo && isValidResponseTime(entry.responseTime))
    .slice(-MAX_DATA_POINTS);

  // Calculate dynamic Y-axis domain based on max value (for page response time)
  const yAxisDomain = (() => {
    if (visibleData.length === 0) return [0, 200] as [number, number];
    
    // Filter out invalid values (NaN, null, undefined, non-finite)
    const validValues = visibleData
      .map(d => d.responseTime)
      .filter(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
    
    if (validValues.length === 0) return [0, 200] as [number, number];
    
    const maxValue = Math.max(...validValues);
    // Use the exact max value recorded
    return [0, maxValue] as [number, number];
  })();

  // Calculate dynamic Y-axis domain for database response time
  const databaseYAxisDomain = (() => {
    if (visibleDatabaseData.length === 0) return [0, 200] as [number, number];
    
    // Filter out invalid values (NaN, null, undefined, non-finite)
    const validValues = visibleDatabaseData
      .map(d => d.responseTime)
      .filter(val => typeof val === 'number' && !isNaN(val) && isFinite(val));
    
    if (validValues.length === 0) return [0, 200] as [number, number];
    
    const maxValue = Math.max(...validValues);
    // Use the exact max value recorded, ensure minimum of 10 for very small values
    return [0, Math.max(maxValue, 10)] as [number, number];
  })();

  // Get current page response time (latest entry) - ensure it's valid
  const currentPageResponseTime = (() => {
    if (pageResponseTimeHistory.length === 0) return undefined;
    const lastEntry = pageResponseTimeHistory[pageResponseTimeHistory.length - 1];
    const responseTime = lastEntry.responseTime;
    // Validate the response time is a valid number
    if (typeof responseTime === 'number' && !isNaN(responseTime) && isFinite(responseTime)) {
      return responseTime;
    }
    return undefined;
  })();

  const fetchHealthData = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      // Calculate page/server response time
      const pageResponseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const dbData = data.services.database;

        // Validate and sanitize response time - ensure it's a valid number
        const newResponseTime = typeof dbData.responseTime === 'number' && 
                                !isNaN(dbData.responseTime) && 
                                isFinite(dbData.responseTime) 
                                ? dbData.responseTime 
                                : undefined;
        
        setDbHealth({
          status: dbData.status,
          connected: dbData.connected,
          responseTime: newResponseTime,
          error: dbData.error,
          activeConnections: dbData.activeConnections,
          maxConnections: dbData.maxConnections,
          droppedConnections: dbData.droppedConnections,
          databaseSize: dbData.databaseSize,
          lastChecked: new Date(dbData.lastChecked),
        });

        // Update page response time history
        const pageTimestamp = Date.now();
        setPageResponseTimeHistory((prev) => {
          const newHistory = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              timestamp: pageTimestamp,
              responseTime: pageResponseTime,
            },
          ];
          // Filter out entries older than 10 minutes and keep only the most recent entries
          const tenMinutesAgo = pageTimestamp - MAX_TIME_WINDOW_MS;
          return newHistory
            .filter(entry => entry.timestamp >= tenMinutesAgo)
            .slice(-MAX_DATA_POINTS);
        });

        // Update database response time history - only if we have a valid response time
        if (newResponseTime !== undefined && newResponseTime !== null) {
          const dbTimestamp = Date.now();
          setDatabaseResponseTimeHistory((prev) => {
            const newHistory = [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                timestamp: dbTimestamp,
                responseTime: newResponseTime,
              },
            ];
            // Filter out entries older than 10 minutes and keep only the most recent entries
            const tenMinutesAgo = dbTimestamp - MAX_TIME_WINDOW_MS;
            return newHistory
              .filter(entry => entry.timestamp >= tenMinutesAgo)
              .slice(-MAX_DATA_POINTS);
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch health data:", err);
      // Calculate page response time even on error
      const pageResponseTime = Date.now() - startTime;
      
      // Update status to unhealthy on error
      setDbHealth((prev) => ({
        ...prev,
        status: "unhealthy",
        connected: false,
        error: err instanceof Error ? err.message : "Failed to fetch health data",
        lastChecked: new Date(),
      }));

      // Still record the response time (even if it's an error)
      const errorTimestamp = Date.now();
      setPageResponseTimeHistory((prev) => {
        const newHistory = [
          ...prev,
          {
            time: new Date().toLocaleTimeString(),
            timestamp: errorTimestamp,
            responseTime: pageResponseTime,
          },
        ];
        // Filter out entries older than 10 minutes and keep only the most recent entries
        const tenMinutesAgo = errorTimestamp - MAX_TIME_WINDOW_MS;
        return newHistory
          .filter(entry => entry.timestamp >= tenMinutesAgo)
          .slice(-MAX_DATA_POINTS);
      });
    } finally {
      setIsRefreshing(false);
      setLastFetchTime(Date.now());
      setProgress(0);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchHealthData, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Update progress bar every second
  useEffect(() => {
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - lastFetchTime;
      const progressPercent = Math.min((elapsed / HEALTH_CHECK_INTERVAL) * 100, 100);
      setProgress(progressPercent);
    }, 1000);

    return () => clearInterval(progressInterval);
  }, [lastFetchTime]);

  // Cleanup invalid entries from history arrays periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const tenMinutesAgo = now - MAX_TIME_WINDOW_MS;
      
      // Clean up page response time history
      setPageResponseTimeHistory((prev) => {
        return prev
          .filter(entry => 
            entry.timestamp >= tenMinutesAgo && 
            typeof entry.responseTime === 'number' && 
            !isNaN(entry.responseTime) && 
            isFinite(entry.responseTime)
          )
          .slice(-MAX_DATA_POINTS);
      });
      
      // Clean up database response time history
      setDatabaseResponseTimeHistory((prev) => {
        return prev
          .filter(entry => 
            entry.timestamp >= tenMinutesAgo && 
            typeof entry.responseTime === 'number' && 
            !isNaN(entry.responseTime) && 
            isFinite(entry.responseTime)
          )
          .slice(-MAX_DATA_POINTS);
      });
    }, 60000); // Run cleanup every minute

    return () => clearInterval(cleanupInterval);
  }, []);


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
                data={combinedData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorResponseTimeCardBackgroundGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorResponseTimeCardBackgroundYellow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorResponseTimeCardBackgroundRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                  </linearGradient>
                  {/* Dynamic gradient definitions for stroke color transitions */}
                  {/* Gradient starts at threshold crossing point and ends at next measuring point */}
                  {colorSegments
                    .filter(seg => seg.isGradient && seg.fromColor && seg.toColor)
                    .map((seg) => {
                      const gradientId = seg.gradientId;
                      // Gradient matches exact start and end colors
                      return (
                        <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={seg.fromColor!}/>
                          <stop offset="100%" stopColor={seg.toColor!}/>
                        </linearGradient>
                      );
                    })}
                  {/* Horizontal gradients for gradient segments (fill) - blends left to right */}
                  {/* Gradient starts at threshold crossing point and ends at next measuring point */}
                  {colorSegments
                    .filter(seg => seg.isGradient && seg.fromColor && seg.toColor)
                    .map((seg) => {
                      const fillGradientId = `${seg.gradientId}-fill`;
                      // Convert hex to rgba for opacity control (vertical fade effect)
                      const hexToRgba = (hex: string, opacity: number) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                      };
                      // Gradient matches exact start and end colors, with vertical opacity fade
                      // Horizontal color blend matches start/end colors exactly
                      return (
                        <linearGradient key={fillGradientId} id={fillGradientId} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={hexToRgba(seg.fromColor!, 0.6)}/>
                          <stop offset="100%" stopColor={hexToRgba(seg.toColor!, 0.6)}/>
                        </linearGradient>
                      );
                    })}
                </defs>
                <YAxis type="number" domain={yAxisDomain} hide />
                {colorSegments.map((segment) => {
                  if (segment.isGradient && segment.fromColor && segment.toColor) {
                    // Gradient segment - transition starts at threshold crossing, ends at next point
                    // Use monotone interpolation for smooth curve
                    const fillGradientId = `${segment.gradientId}-fill`;
                    return (
                      <g key={segment.dataKey}>
                        {/* Gradient fill area - horizontal color blend matching start/end colors */}
                        <Area
                          type="monotone"
                          dataKey={segment.dataKey}
                          stroke="none"
                          fill={`url(#${fillGradientId})`}
                          dot={false}
                          isAnimationActive={true}
                          animationDuration={0}
                          connectNulls={false}
                        />
                        {/* Gradient stroke line - horizontal color blend matching start/end colors */}
                        <Line
                          type="monotone"
                          dataKey={segment.dataKey}
                          stroke={`url(#${segment.gradientId})`}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={true}
                          animationDuration={0}
                          connectNulls={false}
                        />
                      </g>
                    );
                  } else {
                    // Solid color segment - use monotone for smooth curves
                    return (
                      <Area
                        key={segment.dataKey}
                        type="monotone"
                        dataKey={segment.dataKey}
                        stroke={segment.color}
                        strokeWidth={2}
                        fill={`url(#${segment.gradientId})`}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={0}
                        connectNulls={false}
                      />
                    );
                  }
                })}
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
