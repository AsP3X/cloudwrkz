import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { checkDatabaseHealth, isDatabaseAccessible } from "@/lib/utils/db-health";
import type { DatabaseHealthStatus } from "@/lib/utils/db-health";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

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
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${colors[status]}`}
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
}: {
  title: string;
  value: string | number | undefined;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-300">
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
  );
}

export const metadata: Metadata = {
  title: `Health Status | ${APP_CONFIG.name}`,
  description: "Service health status and database monitoring",
  openGraph: {
    title: `Health Status | ${APP_CONFIG.name}`,
    description: "Service health status and database monitoring",
    type: "website",
    siteName: APP_CONFIG.name,
  },
};

export default async function HealthPage() {
  let dbHealth: DatabaseHealthStatus;
  try {
    dbHealth = await checkDatabaseHealth();
  } catch (error) {
    dbHealth = {
      status: "unhealthy",
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
      lastChecked: new Date(),
    };
  }

  const overallStatus =
    dbHealth.status === "healthy"
      ? "healthy"
      : dbHealth.status === "degraded"
      ? "degraded"
      : "unhealthy";

  // Check database availability for header
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  return (
    <>
      <SkipToContent />
      <Header databaseAvailable={databaseAvailable} />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <Link
                href={ROUTES.HOME}
                className="inline-block mb-6 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
              >
                {APP_CONFIG.name}
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
                Service{" "}
                <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                  Health Status
                </span>
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Real-time monitoring of system health and database connectivity
              </p>
            </div>

            {/* Overall Status Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 mb-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                    Overall System Status
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Last checked: {dbHealth.lastChecked.toLocaleString()}
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
                  title="Response Time"
                  value={dbHealth.responseTime ? `${dbHealth.responseTime}ms` : "N/A"}
                  subtitle={dbHealth.responseTime && dbHealth.responseTime > 1000 ? "Slow response detected" : "Normal response time"}
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
              </div>

              {/* Connection Usage Progress Bar */}
              {dbHealth.activeConnections !== undefined &&
                dbHealth.maxConnections !== undefined && (
                  <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                      <span className="font-medium">Connection Usage</span>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {Math.round(
                          (dbHealth.activeConnections / dbHealth.maxConnections) *
                            100
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          (dbHealth.activeConnections / dbHealth.maxConnections) *
                            100 >
                          80
                            ? "bg-red-500"
                            : (dbHealth.activeConnections /
                                dbHealth.maxConnections) *
                                100 >
                              60
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${
                            Math.min(
                              (dbHealth.activeConnections /
                                dbHealth.maxConnections) *
                                100,
                              100
                            )}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                      {dbHealth.activeConnections} of {dbHealth.maxConnections} connections in use
                    </p>
                  </div>
                )}
            </div>

            {/* API Endpoint Info */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8">
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                API Access
              </h2>
              <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                Health status is also available programmatically via our REST API endpoint:
              </p>
              <div className="bg-neutral-50 dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
                <code className="text-sm text-neutral-900 dark:text-neutral-100 font-mono">
                  GET /api/health
                </code>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-4">
                The API returns JSON data with detailed health metrics and service status information.
              </p>
            </div>

            {/* Back to Home Link */}
            <div className="mt-8 text-center">
              <Link
                href={ROUTES.HOME}
                className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
