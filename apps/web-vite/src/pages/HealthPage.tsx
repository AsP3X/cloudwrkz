import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { api, ApiError } from "@/api/client";
import type { HealthPayload, PingPayload } from "@/features/health/types";
import { LatencyAnimatedTail } from "@/features/health/LatencyAnimatedTail";

const POLL_MS = 4000;
/** Rolling window: oldest dropped when full; X-axis uses slots 1…60 so the trace grows left → right. */
const LATENCY_HISTORY_MAX = 60;

const CHART_INTRO_MS = 950;

function DbLatencyChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: LatencyChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white/95 px-3.5 py-2.5 text-xs shadow-lg shadow-indigo-500/10 ring-1 ring-black/5 backdrop-blur-md dark:border-neutral-700/90 dark:bg-neutral-900/95 dark:ring-white/10">
      <p className="font-mono text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{row.at}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Data storage
        </span>
        <span className="font-mono text-base font-bold tabular-nums text-neutral-900 dark:text-white">
          {row.dbMs != null ? row.dbMs : "—"}
          <span className="ml-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">ms</span>
        </span>
      </p>
      <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">Check #{row.seq}</p>
    </div>
  );
}

function ApiLatencyChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: LatencyChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-neutral-200/90 bg-white/95 px-3.5 py-2.5 text-xs shadow-lg shadow-emerald-500/10 ring-1 ring-black/5 backdrop-blur-md dark:border-neutral-700/90 dark:bg-neutral-900/95 dark:ring-white/10">
      <p className="font-mono text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{row.at}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          API ping
        </span>
        <span className="font-mono text-base font-bold tabular-nums text-neutral-900 dark:text-white">
          {row.apiMs != null ? row.apiMs : "—"}
          <span className="ml-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">ms</span>
        </span>
      </p>
      <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-500">
        Time inside API only (no database). Check #{row.seq}
      </p>
    </div>
  );
}

interface LatencySamplePoint {
  seq: number;
  at: string;
  /** Server-reported DB check latency; null if omitted in payload. */
  dbMs: number | null;
  /** `GET …/ping` → `server_processing_ms` from API (handler only, not merged with /health). */
  apiMs: number | null;
}

/** Chart row: `slot` is 1-based index in the visible window (re-indexed after each FIFO shift). */
type LatencyChartRow = LatencySamplePoint & { slot: number };

function dbChartPeakMs(rows: LatencyChartRow[]): number {
  let max = 0;
  for (const d of rows) {
    if (d.dbMs != null && Number.isFinite(d.dbMs)) max = Math.max(max, d.dbMs);
  }
  return max;
}

function apiChartPeakMs(rows: LatencyChartRow[]): number {
  let max = 0;
  for (const d of rows) {
    if (d.apiMs != null && Number.isFinite(d.apiMs)) max = Math.max(max, d.apiMs);
  }
  return max;
}

function formatApiPeakLabel(rows: LatencyChartRow[]): string {
  const peak = apiChartPeakMs(rows);
  if (!Number.isFinite(peak) || peak <= 0) return "0";
  if (peak < 1) return peak.toFixed(3);
  if (peak < 10) return peak.toFixed(2);
  return String(Math.round(peak));
}

function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isRichHealth(d: unknown): d is HealthPayload {
  if (!d || typeof d !== "object" || d === null) return false;
  const s = (d as HealthPayload).services;
  return (
    "api" in d &&
    "services" in d &&
    typeof (d as HealthPayload).api === "object" &&
    s != null &&
    typeof s === "object" &&
    "database" in s &&
    typeof s.database === "object"
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [latencySeries, setLatencySeries] = useState<LatencySamplePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);

      try {
        let apiMs: number | null = null;
        const pingStarted = performance.now();
        try {
          const pingBody = await api.get<PingPayload>("/ping");
          const sp = pingBody.server_processing_ms;
          if (typeof sp === "number" && Number.isFinite(sp)) {
            apiMs = Math.round(sp * 1000) / 1000;
          } else {
            apiMs = Math.round(performance.now() - pingStarted);
          }
        } catch {
          apiMs = null;
        }

        const data = await api.get<unknown>("/health");

        if (!isRichHealth(data)) {
          setHealth(null);
          setError("The service returned data we couldn’t display. Please try again in a moment.");
          return;
        }
        setHealth(data);
        setError(null);

        const dbRaw = data.services.database.response_time_ms;
        const dbMs =
          typeof dbRaw === "number" && Number.isFinite(dbRaw) ? dbRaw : null;

        setLatencySeries((prev) => {
          const nextSeq = prev.length > 0 ? prev[prev.length - 1].seq + 1 : 1;
          const row: LatencySamplePoint = {
            seq: nextSeq,
            at: new Date().toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            dbMs,
            apiMs,
          };
          const merged = [...prev, row];
          if (merged.length <= LATENCY_HISTORY_MAX) return merged;
          return merged.slice(-LATENCY_HISTORY_MAX);
        });
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Please check your internet connection and try again.";
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

  const chartData = useMemo<LatencyChartRow[]>(
    () => latencySeries.map((p, i) => ({ ...p, slot: i + 1 })),
    [latencySeries],
  );

  const lastChartRow = useMemo(
    () => (chartData.length > 0 ? chartData[chartData.length - 1] : undefined),
    [chartData],
  );

  const dbLatencyDomainMax = useMemo(() => {
    if (chartData.length === 0) return 50;
    const peak = dbChartPeakMs(chartData);
    return Math.ceil(Math.max(peak, 1) * 1.15) + 5;
  }, [chartData]);

  const apiLatencyDomainMax = useMemo(() => {
    if (chartData.length === 0) return 1;
    const peak = apiChartPeakMs(chartData);
    const base = peak > 0 ? peak : 0.01;
    return Math.min(50, Math.max(base * 1.28, 0.05));
  }, [chartData]);

  const [dbChartYMax, setDbChartYMax] = useState(dbLatencyDomainMax);
  useEffect(() => {
    const id = window.setInterval(() => {
      setDbChartYMax((prev) => {
        const target = dbLatencyDomainMax;
        if (Math.abs(prev - target) < 0.01) return prev;
        const next = prev + (target - prev) * 0.28;
        return Math.abs(target - next) < 0.55 ? target : next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [dbLatencyDomainMax]);

  const [apiChartYMax, setApiChartYMax] = useState(apiLatencyDomainMax);
  useEffect(() => {
    const id = window.setInterval(() => {
      setApiChartYMax((prev) => {
        const target = apiLatencyDomainMax;
        if (Math.abs(prev - target) < 0.01) return prev;
        const next = prev + (target - prev) * 0.28;
        return Math.abs(target - next) < 0.55 ? target : next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [apiLatencyDomainMax]);

  /** Recharts re-animates the whole series on every data change if this stays true — only run the intro once. */
  const chartIntroStartedRef = useRef(false);
  const [latencyChartSettled, setLatencyChartSettled] = useState(false);
  useEffect(() => {
    if (chartData.length < 2) return;
    if (chartIntroStartedRef.current) return;
    chartIntroStartedRef.current = true;
    const t = window.setTimeout(() => setLatencyChartSettled(true), CHART_INTRO_MS);
    return () => window.clearTimeout(t);
  }, [chartData.length]);

  return (
    <>
      <SkipToContent />
      <Header />
      <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 pb-20 pt-16 dark:from-neutral-950 dark:via-neutral-900 dark:to-indigo-950/40">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-24 h-72 w-72 rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-600/10" />
          <div className="absolute bottom-32 right-1/4 h-80 w-80 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-600/10" />
        </div>

        <div className="relative z-10 w-full px-4 py-10 sm:px-6 lg:px-8 xl:px-10 2xl:px-14">
          <div className="mx-auto w-full max-w-[1920px]">
            <div className="mb-8 flex flex-col gap-6 text-center lg:mb-10 lg:flex-row lg:items-end lg:justify-between lg:text-left">
              <div className="min-w-0 lg:max-w-3xl">
                <Link
                  to={ROUTES.HOME}
                  className="mb-3 inline-block text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-400"
                >
                  {APP_CONFIG.name}
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
                  Service status
                </h1>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  See whether our systems are up, how your data store is doing, and how quickly this page responds from
                  your network. This view is public—no sign-in required.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 lg:shrink-0 lg:justify-end">
                <Button type="button" variant="primary" disabled={refreshing} onClick={() => void fetchHealth(true)}>
                  {refreshing ? "Updating…" : "Refresh"}
                </Button>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">
                  Refreshes automatically every {POLL_MS / 1000} seconds
                </span>
              </div>
            </div>

            {loading && !health ? (
              <div className="h-64 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/60" />
            ) : error ? (
              <div className="rounded-2xl border border-error-200 bg-error-50/90 p-8 text-center dark:border-error-900/50 dark:bg-error-950/30">
                <p className="font-semibold text-error-800 dark:text-error-200">We couldn’t load this page</p>
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
                        Current status
                      </p>
                      <p className="text-xl font-bold text-neutral-900 dark:text-white">
                        {health.status === "healthy"
                          ? "All systems operational"
                          : health.status === "unhealthy"
                            ? "Service disruption"
                            : health.status.replace(/-/g, " ")}
                      </p>
                      {health.timestamp && (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          Last checked {new Date(health.timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 sm:max-w-xs sm:text-right">
                    Release {health.api.version} · {health.api.environment}
                  </p>
                </div>

                {/* Metrics row */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-6 shadow-soft-md backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/70">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                      Capacity
                    </p>
                    <p className="mt-3 text-4xl font-bold tabular-nums text-neutral-900 dark:text-white">
                      {nodesAvailable ?? "—"}
                    </p>
                    <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      Active locations reported:{" "}
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {region ?? "Not assigned"}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      A higher number usually means more copies of the service ready to handle traffic. How this is set
                      up depends on your organization’s hosting plan.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-6 shadow-soft-md backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/70">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                      Data storage
                    </p>
                    <div className="mt-3 flex flex-wrap items-baseline gap-2">
                      <span
                        className={`text-2xl font-bold ${
                          health.services.database.connected
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-error-600 dark:text-error-400"
                        }`}
                      >
                        {health.services.database.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                      <span className="font-mono font-semibold tabular-nums">
                        {health.services.database.pool_connections_idle}
                      </span>{" "}
                      spare connections right now, out of{" "}
                      <span className="font-mono font-semibold tabular-nums">
                        {health.services.database.pool_size}
                      </span>{" "}
                      reserved for data access
                    </p>
                    {health.services.database.response_time_ms != null && (
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                        Latest response time:{" "}
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

                  <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-6 shadow-soft-md backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/70 sm:col-span-2 xl:col-span-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                      Uptime
                    </p>
                    <p className="mt-3 text-4xl font-bold tabular-nums text-neutral-900 dark:text-white">
                      {formatUptime(health.api.uptime_seconds)}
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      How long this version of the service has been running without a restart. Longer usually means a
                      stable period of operation.
                    </p>
                  </div>
                </div>

                {/* Latency charts — database and API measured separately */}
                {chartData.length < 2 ? (
                  <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 p-6 shadow-soft-lg backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/80">
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Response time trends</h2>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      Charts for data storage and your connection will appear after a couple of automatic checks.
                    </p>
                    <div className="mt-6 flex h-48 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/30 dark:text-neutral-400 px-4 text-center">
                      Gathering readings… keep this tab open for a few seconds.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 p-4 shadow-soft-lg backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/80 sm:p-6">
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Data storage response time</h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            How quickly our systems can reach your data on each check (recent {LATENCY_HISTORY_MAX}{" "}
                            readings, newest on the right).
                          </p>
                        </div>
                        {chartData.length > 0 && (
                          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                            {chartData.length} of {LATENCY_HISTORY_MAX} · high {dbChartPeakMs(chartData).toFixed(0)} ms
                          </p>
                        )}
                      </div>
                      <div className="relative mt-1 h-72 w-full overflow-hidden rounded-xl bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent dark:from-indigo-950/20 xl:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 14, right: 14, left: 0, bottom: 6 }}>
                            <defs>
                              <linearGradient id="healthDbLatencyArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.42} />
                                <stop offset="35%" stopColor="#6366f1" stopOpacity={0.2} />
                                <stop offset="85%" stopColor="#4f46e5" stopOpacity={0.04} />
                                <stop offset="100%" stopColor="#4338ca" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="healthDbLatencyLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#c7d2fe" />
                                <stop offset="55%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#4f46e5" />
                              </linearGradient>
                              <filter id="healthDbLatencyGlow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="2" result="blur" />
                                <feMerge>
                                  <feMergeNode in="blur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="5 6"
                              vertical={false}
                              stroke="currentColor"
                              className="text-neutral-200/90 dark:text-neutral-700/85"
                            />
                            <XAxis
                              type="number"
                              dataKey="slot"
                              domain={[1, LATENCY_HISTORY_MAX]}
                              allowDecimals={false}
                              ticks={[1, 15, 30, 45, LATENCY_HISTORY_MAX]}
                              tick={{ fontSize: 10, fill: "currentColor", fontWeight: 500 }}
                              className="text-neutral-400"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={8}
                            />
                            <YAxis
                              domain={[0, dbChartYMax]}
                              width={48}
                              tick={{ fontSize: 10, fill: "currentColor" }}
                              className="text-neutral-400"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={6}
                              unit=" ms"
                            />
                            <Tooltip
                              content={DbLatencyChartTooltip}
                              cursor={{
                                stroke: "#a5b4fc",
                                strokeWidth: 1,
                                strokeDasharray: "4 4",
                                opacity: 0.85,
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="dbMs"
                              stroke="none"
                              fill="url(#healthDbLatencyArea)"
                              fillOpacity={1}
                              baseValue={0}
                              connectNulls={false}
                              isAnimationActive={!latencyChartSettled}
                              animationDuration={CHART_INTRO_MS}
                              animationEasing="ease-out"
                            />
                            <Line
                              type="monotone"
                              dataKey="dbMs"
                              stroke="url(#healthDbLatencyLine)"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              dot={false}
                              activeDot={false}
                              filter="url(#healthDbLatencyGlow)"
                              connectNulls={false}
                              isAnimationActive={!latencyChartSettled}
                              animationDuration={CHART_INTRO_MS}
                              animationEasing="ease-out"
                            />
                            {lastChartRow?.dbMs != null ? (
                              <LatencyAnimatedTail
                                lastPoint={{ slot: lastChartRow.slot, value: lastChartRow.dbMs }}
                                durationMs={420}
                                pulseStroke="#a5b4fc"
                                dotFill="#4f46e5"
                                dotShadow="drop-shadow(0 0 6px rgba(99,102,241,0.55))"
                              />
                            ) : null}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white/90 p-4 shadow-soft-lg backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/80 sm:p-6">
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">API ping</h2>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            Each point uses{" "}
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                              server_processing_ms
                            </code>{" "}
                            from{" "}
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                              GET /ping
                            </code>
                            —time inside the API only, fetched <span className="font-medium">before</span>{" "}
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                              /health
                            </code>{" "}
                            so it never mixes with the database check (left chart).
                          </p>
                        </div>
                        {chartData.length > 0 && (
                          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {chartData.length} of {LATENCY_HISTORY_MAX} · high {formatApiPeakLabel(chartData)} ms
                          </p>
                        )}
                      </div>
                      <div className="relative mt-1 h-72 w-full overflow-hidden rounded-xl bg-gradient-to-b from-emerald-50/35 via-transparent to-transparent dark:from-emerald-950/20 xl:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 14, right: 14, left: 0, bottom: 6 }}>
                            <defs>
                              <linearGradient id="healthApiLatencyArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.38} />
                                <stop offset="40%" stopColor="#34d399" stopOpacity={0.14} />
                                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="healthApiLatencyLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#a7f3d0" />
                                <stop offset="50%" stopColor="#34d399" />
                                <stop offset="100%" stopColor="#059669" />
                              </linearGradient>
                              <filter id="healthApiLatencyGlow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="2" result="blur" />
                                <feMerge>
                                  <feMergeNode in="blur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="5 6"
                              vertical={false}
                              stroke="currentColor"
                              className="text-neutral-200/90 dark:text-neutral-700/85"
                            />
                            <XAxis
                              type="number"
                              dataKey="slot"
                              domain={[1, LATENCY_HISTORY_MAX]}
                              allowDecimals={false}
                              ticks={[1, 15, 30, 45, LATENCY_HISTORY_MAX]}
                              tick={{ fontSize: 10, fill: "currentColor", fontWeight: 500 }}
                              className="text-neutral-400"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={8}
                            />
                            <YAxis
                              domain={[0, apiChartYMax]}
                              width={48}
                              tick={{ fontSize: 10, fill: "currentColor" }}
                              className="text-neutral-400"
                              tickLine={false}
                              axisLine={false}
                              tickMargin={6}
                              unit=" ms"
                            />
                            <Tooltip
                              content={ApiLatencyChartTooltip}
                              cursor={{
                                stroke: "#6ee7b7",
                                strokeWidth: 1,
                                strokeDasharray: "4 4",
                                opacity: 0.85,
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="apiMs"
                              stroke="none"
                              fill="url(#healthApiLatencyArea)"
                              fillOpacity={1}
                              baseValue={0}
                              connectNulls={false}
                              isAnimationActive={!latencyChartSettled}
                              animationDuration={CHART_INTRO_MS}
                              animationEasing="ease-out"
                            />
                            <Line
                              type="monotone"
                              dataKey="apiMs"
                              stroke="url(#healthApiLatencyLine)"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              dot={false}
                              activeDot={false}
                              filter="url(#healthApiLatencyGlow)"
                              connectNulls={false}
                              isAnimationActive={!latencyChartSettled}
                              animationDuration={CHART_INTRO_MS}
                              animationEasing="ease-out"
                            />
                            {lastChartRow != null && lastChartRow.apiMs != null ? (
                              <LatencyAnimatedTail
                                lastPoint={{ slot: lastChartRow.slot, value: lastChartRow.apiMs }}
                                durationMs={420}
                                pulseStroke="#6ee7b7"
                                dotFill="#059669"
                                dotShadow="drop-shadow(0 0 6px rgba(5,150,105,0.45))"
                              />
                            ) : null}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start">
                  <p className="text-center text-xs text-neutral-500 dark:text-neutral-500 lg:text-left">
                    This page shows essentials only. Deeper diagnostics (for example server memory or disk use) are
                    available to your IT or support team through their usual tools.
                  </p>
                  <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4 text-center dark:border-neutral-700 dark:bg-neutral-950/40 lg:text-left">
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">Technical reference:</span>{" "}
                      machine-readable status: full check with DB at{" "}
                      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] dark:bg-neutral-900">
                        {apiBase}/health
                      </code>{" "}
                      (and <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] dark:bg-neutral-900">
                        /api/health
                      </code>
                      ); process-only ping at{" "}
                      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] dark:bg-neutral-900">
                        {apiBase}/ping
                      </code>
                      .
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 text-center lg:text-left">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
