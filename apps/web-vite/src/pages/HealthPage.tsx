import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/Badge";

interface HealthResponse {
  status?: string;
  database?: { connected?: boolean; error?: string };
  timestamp?: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await api.get<HealthResponse>("/health");
        setHealth(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch health status");
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };
    fetchHealth();
  }, []);

  return (
    <>
      <SkipToContent />
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <Link
                to={ROUTES.HOME}
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
                Real-time monitoring of system health and API connectivity
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 mb-6">
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                API Health Check
              </h2>
              {loading ? (
                <p className="text-neutral-600 dark:text-neutral-400">Checking...</p>
              ) : error ? (
                <div className="space-y-2">
                  <Badge variant="error">Unhealthy</Badge>
                  <p className="text-neutral-600 dark:text-neutral-400">{error}</p>
                </div>
              ) : health ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant={health.status === "healthy" ? "success" : "error"}>
                      {health.status || "Unknown"}
                    </Badge>
                    {health.database && (
                      <Badge variant={health.database.connected ? "success" : "error"}>
                        Database: {health.database.connected ? "Connected" : "Disconnected"}
                      </Badge>
                    )}
                  </div>
                  {health.database?.error && (
                    <p className="text-sm text-error-600 dark:text-error-400">
                      {health.database.error}
                    </p>
                  )}
                  {health.timestamp && (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Last checked: {new Date(health.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

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
            </div>

            <div className="mt-8 text-center">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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
