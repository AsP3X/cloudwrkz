import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";

// Human: Admin analytics landing page combining headline counters, charts, and optional deeper analytics payloads.
// Agent: GET dashboard stats + analytics endpoints; HANDLES ApiError fallback; RENDERS Recharts pies/bars/areas.

interface DashboardStats {
  totalUsers: number;
  usersByStatus: { ACTIVE: number; PENDING: number; SUSPENDED: number; DELETED: number };
  totalTickets: number;
  ticketsByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    PENDING: number;
    RESOLVED: number;
    CLOSED: number;
    CANCELLED: number;
  };
  todos?: number;
  links?: number;
  activeSessions: number;
  enabledModules: number;
  totalModules: number;
  totalGroups: number;
  recentRegistrations: number;
  recentTickets: number;
}

interface Analytics {
  ticketsCreatedByDay: { date: string; count: number }[];
  timeTrackedByDay: { date: string; totalSeconds: number }[];
  usersCreatedByDay: { date: string; count: number }[];
  ticketsByPriority: { LOW: number; MEDIUM: number; HIGH: number; URGENT: number };
}

const CHART_COLORS = {
  tickets: ["#0ea5e9", "#06b6d4", "#8b5cf6", "#a855f7"],
  status: ["#f59e0b", "#3b82f6", "#6366f1", "#22c55e", "#14b8a6", "#94a3b8"],
  priority: ["#22c55e", "#eab308", "#f97316", "#ef4444"],
  area: ["#0ea5e9", "#06b6d4"],
};

// Human: Backfills missing calendar days in chart datasets so lines don’t gap when the API omits zero-count days.
// Agent: GENERIC T extends {date}; BUILDS Map by date string; FILLS defaultValue for key across rolling window.

function fillMissingDays<T extends { date: string }>(
  items: T[],
  days: number,
  key: keyof T,
  defaultValue: number
): T[] {
  const map = new Map(items.map((i) => [i.date, i]));
  const result: T[] = [];
  const start = new Date();
  start.setDate(start.getDate() - days);
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const existing = map.get(dateStr);
    result.push(
      (existing ? { ...existing } : { date: dateStr, [key]: defaultValue }) as T
    );
  }
  return result;
}

// Human: Loads dashboard and analytics JSON, toggles unavailable states, and composes multiple chart sections.
// Agent: STATE stats,analytics,analyticsUnavailable,loading; useEffect load(); MAPS data into Recharts containers.

export default function AdminStatisticsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setAnalyticsUnavailable(false);
      try {
        const [statsRes, analyticsRes] = await Promise.all([
          api.get<DashboardStats>("/admin/dashboard-stats"),
          api.get<Analytics>("/admin/statistics/analytics").catch((err) => {
            if (err instanceof ApiError && err.status === 404) {
              setAnalyticsUnavailable(true);
              return null;
            }
            throw err;
          }),
        ]);
        setStats(statsRes);
        setAnalytics(analyticsRes ?? null);
      } catch {
        setStats(null);
        setAnalytics(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const ticketsChartData = useMemo(() => {
    if (!analytics?.ticketsCreatedByDay.length) return [];
    return fillMissingDays(
      analytics.ticketsCreatedByDay,
      30,
      "count",
      0
    ).slice(-30);
  }, [analytics]);

  const timeTrackedChartData = useMemo(() => {
    if (!analytics?.timeTrackedByDay.length) return [];
    const withHours = analytics.timeTrackedByDay.map((d) => ({
      date: d.date,
      hours: Math.round((d.totalSeconds / 3600) * 10) / 10,
    }));
    return fillMissingDays(withHours, 30, "hours", 0).slice(-30);
  }, [analytics]);

  const usersChartData = useMemo(() => {
    if (!analytics?.usersCreatedByDay.length) return [];
    return fillMissingDays(
      analytics.usersCreatedByDay,
      30,
      "count",
      0
    ).slice(-30);
  }, [analytics]);

  const ticketStatusPieData = useMemo(() => {
    if (!stats?.ticketsByStatus) return [];
    const statusLabels: Record<string, string> = {
      OPEN: "Open",
      IN_PROGRESS: "In progress",
      PENDING: "Pending",
      RESOLVED: "Resolved",
      CLOSED: "Closed",
      CANCELLED: "Cancelled",
    };
    return Object.entries(stats.ticketsByStatus)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({
        name: statusLabels[status] ?? status,
        value: count,
      }));
  }, [stats]);

  const ticketPriorityBarData = useMemo(() => {
    if (!analytics?.ticketsByPriority) return [];
    return ["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => ({
      priority: p,
      count: analytics.ticketsByPriority[p as keyof typeof analytics.ticketsByPriority] ?? 0,
    }));
  }, [analytics]);

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  const cardBase =
    "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          Statistics &amp; analytics
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Application performance, tickets, and usage over time
        </p>
      </div>

      {analyticsUnavailable && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Time-series analytics are unavailable. Ensure the API server (Rust backend) is running and exposes{" "}
          <code className="text-xs bg-amber-100 dark:bg-amber-900/50 px-1 rounded">/admin/statistics/analytics</code>.
          Summary stats above are still from the dashboard API.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Total users
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats?.totalUsers ?? 0}
          </p>
          {stats && (
            <p className="text-xs text-neutral-500 mt-1">
              {stats.usersByStatus.ACTIVE} active
            </p>
          )}
        </div>
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Tickets
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats?.totalTickets ?? 0}
          </p>
          {stats && (
            <p className="text-xs text-neutral-500 mt-1">
              {(stats.ticketsByStatus.OPEN + stats.ticketsByStatus.IN_PROGRESS + stats.ticketsByStatus.PENDING).toLocaleString()} open
            </p>
          )}
        </div>
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Todos
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats?.todos ?? 0}
          </p>
        </div>
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Links
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats?.links ?? 0}
          </p>
        </div>
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Active sessions
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {stats?.activeSessions ?? 0}
          </p>
        </div>
        <div className={`${cardBase} p-4`}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Last 7 days
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            +{stats?.recentTickets ?? 0} tickets
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            +{stats?.recentRegistrations ?? 0} signups
          </p>
        </div>
      </div>

      {/* Tickets created over time */}
      <div className={`${cardBase} p-6`}>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Tickets created (last 30 days)
        </h2>
        <div className="h-72">
          {ticketsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ticketsChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ticketsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.area[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.area[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--tw-bg-opacity)", borderRadius: "0.5rem" }}
                  labelFormatter={(v) => v}
                  formatter={(value: unknown) => [Number(value ?? 0), "Tickets"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={CHART_COLORS.area[0]}
                  strokeWidth={2}
                  fill="url(#ticketsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500">
              {analyticsUnavailable ? "Analytics API unavailable" : "No ticket data"}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ticket status distribution */}
        <div className={`${cardBase} p-6`}>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Tickets by status
          </h2>
          <div className="h-72">
            {ticketStatusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ticketStatusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {ticketStatusPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS.status[i % CHART_COLORS.status.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown) => [Number(value ?? 0), "Tickets"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500">
                No ticket data
              </div>
            )}
          </div>
        </div>

        {/* Ticket priority */}
        <div className={`${cardBase} p-6`}>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Tickets by priority
          </h2>
          <div className="h-72">
            {ticketPriorityBarData.some((d) => d.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ticketPriorityBarData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 60, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(value: unknown) => [Number(value ?? 0), "Tickets"]} />
                  <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
                    {ticketPriorityBarData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS.priority[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500">
                {analyticsUnavailable ? "Analytics API unavailable" : "No priority data"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time tracked over time */}
      <div className={`${cardBase} p-6`}>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Time tracked (last 30 days, hours)
        </h2>
        <div className="h-72">
          {timeTrackedChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeTrackedChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                <Tooltip formatter={(value: unknown) => [Number(value ?? 0), "Hours"]} />
                <Bar dataKey="hours" name="Hours" fill={CHART_COLORS.area[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500">
              {analyticsUnavailable ? "Analytics API unavailable" : "No time tracking data"}
            </div>
          )}
        </div>
      </div>

      {/* New users over time */}
      <div className={`${cardBase} p-6`}>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          New user signups (last 30 days)
        </h2>
        <div className="h-72">
          {usersChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usersChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(value: unknown) => [Number(value ?? 0), "Signups"]} />
                <Bar dataKey="count" name="Signups" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500">
              {analyticsUnavailable ? "Analytics API unavailable" : "No signup data"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
