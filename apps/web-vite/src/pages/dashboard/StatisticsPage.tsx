import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api } from "@/api/client";
import { Select } from "@/components/ui/Select";
import { STATISTICS_TIMEFRAMES, type StatisticsTimeframe } from "@/lib/constants/statistics";

const COLORS = {
  primary: "#3b82f6",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
} as const;

const integerFormatter = new Intl.NumberFormat("en-US");

function formatInteger(value: number) {
  return integerFormatter.format(value);
}

function formatDecimal(value: number, fractionDigits = 1) {
  return value.toFixed(fractionDigits);
}

interface StatCardProps {
  label: string;
  value: string;
  helperText?: string;
  tone?: "default" | "positive" | "negative";
}

function StatCard({ label, value, helperText, tone = "default" }: StatCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-success-600"
      : tone === "negative"
      ? "text-error-600"
      : "text-neutral-500 dark:text-neutral-500";

  return (
    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-5">
      <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400">
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-1.5">
        {value}
      </p>
      {helperText && (
        <p className={`mt-1 text-xs sm:text-sm ${toneClass}`}>
          {helperText}
        </p>
      )}
    </div>
  );
}

interface AgentStatistics {
  tickets: {
    totalAssigned: number;
    averageResolutionTime: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    createdByDay: Array<{ date: string; count: number }>;
    resolvedByDay: Array<{ date: string; count: number }>;
  };
  time: {
    totalHoursLast7Days: number;
    totalHoursLast30Days: number;
    timeTrackingEnabled: boolean;
    hoursByDayLast7Days: Array<{ date: string; hours: number }>;
  };
}

const TICKET_STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default function StatisticsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [stats, setStats] = useState<AgentStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  const timeframe = (searchParams.get("timeframe") || "30d") as StatisticsTimeframe;
  const currentTicketStatusFilter = searchParams.get("ticketStatus") || "ALL";

  const timeframeConfig =
    STATISTICS_TIMEFRAMES.find((t) => t.value === timeframe) ?? STATISTICS_TIMEFRAMES[1];

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("timeframe", timeframe);
      if (currentTicketStatusFilter !== "ALL") params.set("status", currentTicketStatusFilter);
      const data = await api.get<AgentStatistics>(`/statistics?${params.toString()}`);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [timeframe, currentTicketStatusFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleTimeframeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "30d") params.delete("timeframe"); else params.set("timeframe", value);
    navigate(`${pathname}?${params.toString()}`);
  };

  const handleTicketStatusFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL") params.delete("ticketStatus"); else params.set("ticketStatus", value);
    navigate(`${pathname}?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Failed to load statistics</p>
      </div>
    );
  }

  const { tickets, time } = stats;

  const ticketStatusData = Object.entries(tickets.byStatus).map(([status, value]) => ({
    status,
    name: status,
    value,
  }));

  const filteredTicketStatusData =
    currentTicketStatusFilter === "ALL"
      ? ticketStatusData
      : ticketStatusData.filter((item) => item.status === currentTicketStatusFilter);

  const ticketPriorityData = Object.entries(tickets.byPriority).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketTypeData = Object.entries(tickets.byType).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketActivityData = (() => {
    const dateMap = new Map<string, { date: string; created: number; resolved: number }>();
    tickets.createdByDay.forEach((item) => {
      dateMap.set(item.date, { date: item.date, created: item.count, resolved: 0 });
    });
    tickets.resolvedByDay.forEach((item) => {
      const existing = dateMap.get(item.date);
      if (existing) existing.resolved = item.count;
      else dateMap.set(item.date, { date: item.date, created: 0, resolved: item.count });
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const timeByDayData = time.hoursByDayLast7Days;

  const openCount = (tickets.byStatus.OPEN || 0) + (tickets.byStatus.IN_PROGRESS || 0) + (tickets.byStatus.PENDING || 0);
  const resolvedCount = (tickets.byStatus.RESOLVED || 0) + (tickets.byStatus.CLOSED || 0) + (tickets.byStatus.CANCELLED || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            My statistics
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Personal overview of your tickets and time tracking performance.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="w-full sm:w-44">
            <Select
              label="Timeframe"
              options={STATISTICS_TIMEFRAMES as unknown as Array<{ value: string; label: string }>}
              value={timeframe}
              onChange={handleTimeframeChange}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              label="Ticket filter"
              options={TICKET_STATUS_FILTER_OPTIONS as unknown as Array<{ value: string; label: string }>}
              value={currentTicketStatusFilter}
              onChange={handleTicketStatusFilterChange}
            />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Assigned tickets"
            value={formatInteger(tickets.totalAssigned)}
            helperText={`${formatInteger(openCount)} currently open`}
          />
          <StatCard
            label="Resolved / closed"
            value={formatInteger(resolvedCount)}
            helperText={`Avg. resolution time ${formatDecimal(tickets.averageResolutionTime)}h`}
          />
          <StatCard
            label="Hours tracked (7 days)"
            value={`${formatDecimal(time.totalHoursLast7Days)}h`}
            helperText={time.timeTrackingEnabled ? "Based on your time entries" : "Time tracking module is disabled"}
          />
          <StatCard
            label="Hours tracked (30 days)"
            value={`${formatDecimal(time.totalHoursLast30Days)}h`}
            helperText={time.timeTrackingEnabled ? undefined : "No time data available"}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Ticket performance
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-500">
            Tickets where you are the assignee
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Tickets by status
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredTicketStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.primary} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Ticket activity ({timeframeConfig.label.toLowerCase()})
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ticketActivityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" stroke={COLORS.primary} name="Created" strokeWidth={2} />
                  <Line type="monotone" dataKey="resolved" stroke={COLORS.success} name="Resolved" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Tickets by priority
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketPriorityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.warning} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Tickets by type
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.info} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Time tracking
          </h2>
          {!time.timeTrackingEnabled && (
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-500">
              Time tracking module is currently disabled.
            </p>
          )}
        </div>

        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
            Logged hours (last 7 days)
          </h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeByDayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="hours" fill={COLORS.secondary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
