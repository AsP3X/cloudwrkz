import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { Button } from "@/components/ui/Button";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { api, ApiError } from "@/api/client";
import type { HealthPayload } from "@/features/health/types";

const POLL_MS = 4000;
const LATENCY_HISTORY_MAX = 40;

const CHART_COLORS = {
  stroke: "#6366f1",
  fill: "url(#healthLatencyGradient)",
} as const;

interface LatencyPoint {
  seq: number;
  ms: number;
  at: string;
}

function isRichHealth(d: unknown): d is HealthPayload {
  return (
    !!d &&
    typeof d === "object" &&
    d !== null &&
    "api" in d &&
    "services" in d &&
    typeof (d as HealthPayload).api === "object" &&
    typeof (d as HealthPayload).services === "object"
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [latencySeries, setLatencySeries] = useState<LatencyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = import.meta.env.DEV ? "/api/v1" : (import.meta.env.VITE_API_URL || "/api/v1");

  const fetchHealth = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const data = await api.get<unknown>("/health");
        if (!isRichHealth(data)) {
          setHealth(null);
          setError("Unexpected health response from API.");
          return;
        }
        setHealth(data);
        setError(null);

        const ms = data.services.database.response_time_ms;
        if (typeof ms === "number" && Number.isFinite(ms)) {
          setLatencySeries((prev) => {
            const nextSeq = prev.length > 0 ? prev[prev.length - 1].seq + 1 : 1;
            const row: LatencyPoint = {
              seq: nextSeq,
              ms,
              at: new Date().toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            };
            const merged = [...prev, row];
            return merged.length > LATENCY_HISTORY_MAX ? merged.slice(-LATENCY_HISTORY_MAX) : merged;
          });
        }
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to fetch health status";
        setError(msg);
        setHealth(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchHealth(false);
    const id = window.setInterval(() => void fetchHealth(false), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchHealth]);

  const overallOk = health?.status === "healthy" && health.services.database.connected;

  const nodesAvailable = health?.api.nodes_available ?? null;
  const region = health?.api.region?.trim() || null;

  const chartData = useMemo(() => latencySeries, [latencySeries]);

  const latencyDomainMax = useMemo(() => {
    if (chartData.length === 0) return 50;
    const maxMs = Math.max(...chartData.map((d) => d.ms), 1);
    return Math.ceil(maxMs * 1.15) + 5;
  }, [chartData]);

  return (
    <>
      <SkipToContent />
      <Header />
      <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 pb-20 pt-16 dark:from-neutral-950 dark:via-neutral-900 dark:to-indigo-950/40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-24 h-72 w-72 rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-600/10" />
          <div className="absolute bottom-32 right-1/4 h-80 w-80 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-600/10" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 text-center">
              <Link
                to={ROUTES.HOME}
                className="mb-3 inline-block text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-400"
              >
                {APP_CONFIG.name}
              </Link>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
                Service health
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Public status: how many API nodes this deployment reports, region, and database reachability.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" variant="primary" disabled={refreshing} onClick={() => void fetchHealth(true)}>
                  {refreshing ? "Updating…" : "Refresh"}
                </Button>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">
                  Live samples every {POLL_MS / 1000}s
                </span>
              </div>
            </div>

            {loading && !health ? (
              <div className="h-64 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/60" />
            ) : error ? (
              <div className="rounded-2xl border border-error-200 bg-error-50/90 p-8 text-center dark:border-error-900/50 dark:bg-error-950/30">
                <p className="font-semibold text-error-800 dark:text-error-200">Unable to load status</p>
                <p className="mt-2 text-sm text-error-700 dark:text-error-300">{error}</p>
                <Button type="button" className="mt-5" variant="primary" onClick={() => void fetchHealth(true)}>
                  Retry
                </Button>
              </div>
            ) : health ? (
              <div className="space-y-6">
                {/* Summary strip */}
                <div
                  className={`flex flex-col gap-4 rounded-2xl border p-6 shadow-soft-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between ${
                    overallOk
                      ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/25"
                      : "border-amber-200/90 bg-amber-50/85 dark:border-amber-900/45 dark:bg-amber-950/25"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold shadow-inner ${
                        overallOk
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
                          : "bg-amber-500/20 text-amber-800 dark:text-amber-100"
                      }`}
                    >
                      {overallOk ? "OK" : "!"}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Overall
                      </p>
                      <p className="text-xl font-bold capitalize text-neutral-900 dark:text-white">
                        {health.status}
                      </p>
                      {health.timestamp && (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          Server: {new Date(health.timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 sm:max-w-xs sm:text-right">
                    v{health.api.version} · {health.api.environment}
                  </p>
                </div>

                {/* Metrics row */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-6 shadow-soft-md backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/70">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                      API nodes
                    </p>
                    <p className="mt-3 text-4xl font-bold tabular-nums text-neutral-900 dark:text-white">
                      {nodesAvailable ?? "—"}
                    </p>
                    <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      Region:{" "}
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">
                        {region ?? "Not configured"}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      Single-process deployments report{" "}
                      <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">1</code>{" "}
                      until you run a multi-endpoint / global node pool. Set{" "}
                      <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">API_REGION</code>{" "}
                      or start with{" "}
                      <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
                        --region &lt;id&gt;
                      </code>
                      . Optional{" "}
                      <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
                        API_NODES_AVAILABLE
                      </code>{" "}
                      /{" "}
                      <code className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
                        --api-nodes N
                      </code>{" "}
                      for staged rollouts.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-6 shadow-soft-md backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/70">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                      Database
                    </p>
                    <div className="mt-3 flex flex-wrap items-baseline gap-2">
                      <span
                        className={`text-2xl font-bold capitalize ${
                          health.services.database.connected
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-error-600 dark:text-error-400"
                        }`}
                      >
                        {health.services.database.connected ? "Reachable" : "Unavailable"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                      Pool:{" "}
                      <span className="font-mono font-semibold tabular-nums">
                        {health.services.database.pool_connections_idle}
                      </span>{" "}
                      idle /{" "}
                      <span className="font-mono font-semibold tabular-nums">
                        {health.services.database.pool_size}
                      </span>{" "}
                      total connections
                    </p>
                    {health.services.database.response_time_ms != null && (
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                        Last check latency:{" "}
                        <span className="font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                          {health.services.database.response_time_ms} ms
                        </span>
                      </p>
                    )}
                    {health.services.database.error && (
                      <p className="mt-3 rounded-lg border border-error-200 bg-error-50 p-3 text-xs text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200">
                        {health.services.database.error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Latency chart */}
                <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 p-4 shadow-soft-lg backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/80 sm:p-6">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Database check latency</h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Rolling history from this page (GET <span className="font-mono">/health</span> round-trip + DB{" "}
                        <span className="font-mono">SELECT 1</span> on the server)
                      </p>
                    </div>
                    {chartData.length > 0 && (
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {chartData.length} samples · max {Math.max(...chartData.map((d) => d.ms)).toFixed(0)} ms
                      </p>
                    )}
                  </div>

                  {chartData.length < 2 ? (
                    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/30 dark:text-neutral-400">
                      Collecting samples… leave this page open for a few seconds.
                    </div>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="healthLatencyGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                          <XAxis
                            dataKey="seq"
                            tick={{ fontSize: 10, fill: "currentColor" }}
                            className="text-neutral-400"
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            domain={[0, latencyDomainMax]}
                            width={44}
                            tick={{ fontSize: 10, fill: "currentColor" }}
                            className="text-neutral-400"
                            tickLine={false}
                            axisLine={false}
                            unit=" ms"
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "12px",
                              border: "1px solid rgb(229 231 235)",
                              background: "rgba(255,255,255,0.95)",
                            }}
                            labelFormatter={(_label, payload) => {
                              const row = payload?.[0]?.payload as LatencyPoint | undefined;
                              return row?.at ?? "";
                            }}
                            formatter={(value) => [`${value ?? "—"} ms`, "Latency"]}
                          />
                          <Area
                            type="monotone"
                            dataKey="ms"
                            name="Latency"
                            stroke={CHART_COLORS.stroke}
                            strokeWidth={2.5}
                            fill={CHART_COLORS.fill}
                            dot={{ r: 2, strokeWidth: 1, fill: "#4f46e5" }}
                            activeDot={{ r: 5 }}
                            isAnimationActive
                            animationDuration={450}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <p className="text-center text-xs text-neutral-500 dark:text-neutral-500">
                  Machine-level metrics (memory, disks, CPU) stay on the JSON API for operators; this page stays minimal
                  on purpose.
                </p>
              </div>
            ) : null}

            <div className="mt-10 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-center dark:border-neutral-700 dark:bg-neutral-950/40">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Operators: full JSON at{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono dark:bg-neutral-900">
                  GET {apiBase}/health
                </code>{" "}
                and{" "}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono dark:bg-neutral-900">GET /api/health</code>
              </p>
            </div>

            <div className="mt-8 text-center">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
