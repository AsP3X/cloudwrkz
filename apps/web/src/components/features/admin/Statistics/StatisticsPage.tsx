"use client";

import React, { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
const BarChart = dynamic(() => import("recharts").then(mod => ({ default: mod.BarChart })), { ssr: false });
const Bar = dynamic(() => import("recharts").then(mod => ({ default: mod.Bar })), { ssr: false });
const LineChart = dynamic(() => import("recharts").then(mod => ({ default: mod.LineChart })), { ssr: false });
const Line = dynamic(() => import("recharts").then(mod => ({ default: mod.Line })), { ssr: false });
const PieChart = dynamic(() => import("recharts").then(mod => ({ default: mod.PieChart })), { ssr: false });
const Pie = dynamic(() => import("recharts").then(mod => ({ default: mod.Pie })), { ssr: false });
const Cell = dynamic(() => import("recharts").then(mod => ({ default: mod.Cell })), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(mod => ({ default: mod.XAxis })), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(mod => ({ default: mod.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(mod => ({ default: mod.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(mod => ({ default: mod.Tooltip })), { ssr: false });
const Legend = dynamic(() => import("recharts").then(mod => ({ default: mod.Legend })), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(mod => ({ default: mod.ResponsiveContainer })), { ssr: false });
import type {
  getUserStatistics,
  getTicketStatistics,
  getSystemStatistics,
} from "@/server/actions/admin/statistics";
import { Select } from "@/components/ui/Select";
import { STATISTICS_TIMEFRAMES, type StatisticsTimeframe } from "@/lib/constants/statistics";

type UserStatistics = Awaited<ReturnType<typeof getUserStatistics>>;
type TicketStatistics = Awaited<ReturnType<typeof getTicketStatistics>>;
type SystemStatistics = Awaited<ReturnType<typeof getSystemStatistics>>;

interface StatisticsPageProps {
  userStatistics: UserStatistics;
  ticketStatistics: TicketStatistics;
  systemStatistics: SystemStatistics;
  timeframe: StatisticsTimeframe;
}

const COLORS = {
  primary: "#3b82f6",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
} as const;

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: COLORS.success,
  PENDING: COLORS.warning,
  SUSPENDED: COLORS.error,
  DELETED: "#6b7280",
  OPEN: COLORS.primary,
  IN_PROGRESS: COLORS.warning,
  RESOLVED: COLORS.success,
  CLOSED: "#6b7280",
  CANCELLED: COLORS.error,
};

// Locale-stable number formatting (avoids hydration mismatch)
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

const TICKET_STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function StatisticsPage(props: StatisticsPageProps) {
  return (
    <Suspense fallback={null}>
      <StatisticsPageInner {...props} />
    </Suspense>
  );
}

function StatisticsPageInner({
  userStatistics,
  ticketStatistics,
  systemStatistics,
  timeframe,
}: StatisticsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentTicketStatusFilter =
    (searchParams.get("ticketStatus") as (typeof TICKET_STATUS_FILTER_OPTIONS)[number]["value"] | null) ??
    "ALL";

  const timeframeConfig =
    STATISTICS_TIMEFRAMES.find((t) => t.value === timeframe) ?? STATISTICS_TIMEFRAMES[1];

  const handleTimeframeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as StatisticsTimeframe;
    const params = new URLSearchParams(searchParams.toString());

    if (value === "30d") {
      params.delete("timeframe");
    } else {
      params.set("timeframe", value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleTicketStatusFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as (typeof TICKET_STATUS_FILTER_OPTIONS)[number]["value"];
    const params = new URLSearchParams(searchParams.toString());

    if (value === "ALL") {
      params.delete("ticketStatus");
    } else {
      params.set("ticketStatus", value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };
  // Derived metrics
  const resolvedCount =
    ticketStatistics.byStatus.RESOLVED +
    ticketStatistics.byStatus.CLOSED +
    ticketStatistics.byStatus.CANCELLED;

  const ticketClosureRate =
    ticketStatistics.total > 0
      ? (resolvedCount / ticketStatistics.total) * 100
      : 0;

  const ticketsPerUser =
    userStatistics.total > 0
      ? ticketStatistics.total / userStatistics.total
      : 0;

  // Prepare data for charts
  const userStatusData = Object.entries(userStatistics.byStatus).map(
    ([name, value]) => ({
      name,
      value,
    })
  );

  const userRoleData = Object.entries(userStatistics.byRole).map(
    ([name, value]) => ({
      name,
      value,
    })
  );

  const ticketStatusData = Object.entries(ticketStatistics.byStatus).map(
    ([status, value]) => ({
      status,
      name: status.replace("_", " "),
      value,
    })
  );

  const filteredTicketStatusData = React.useMemo(
    () =>
      currentTicketStatusFilter === "ALL"
        ? ticketStatusData
        : ticketStatusData.filter((item) => item.status === currentTicketStatusFilter),
    [currentTicketStatusFilter, ticketStatusData]
  );

  const ticketPriorityData = Object.entries(ticketStatistics.byPriority).map(
    ([name, value]) => ({
      name,
      value,
    })
  );

  const ticketTypeData = Object.entries(ticketStatistics.byType).map(
    ([name, value]) => ({
      name,
      value,
    })
  );

  // Merge ticket activity data for comparison chart
  const ticketActivityData = React.useMemo(() => {
    const dateMap = new Map<
      string,
      { date: string; created: number; resolved: number }
    >();

    ticketStatistics.createdByDay.forEach((item) => {
      dateMap.set(item.date, {
        date: item.date,
        created: item.count,
        resolved: 0,
      });
    });

    ticketStatistics.resolvedByDay.forEach((item) => {
      const existing = dateMap.get(item.date);
      if (existing) {
        existing.resolved = item.count;
      } else {
        dateMap.set(item.date, {
          date: item.date,
          created: 0,
          resolved: item.count,
        });
      }
    });

    return Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [ticketStatistics.createdByDay, ticketStatistics.resolvedByDay]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            System statistics
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            High-level overview of users, tickets, and system health.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="w-full sm:w-44">
            <Select
              label="Timeframe"
              options={STATISTICS_TIMEFRAMES}
              value={timeframe}
              onChange={handleTimeframeChange}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              label="Ticket filter"
              options={TICKET_STATUS_FILTER_OPTIONS}
              value={currentTicketStatusFilter}
              onChange={handleTicketStatusFilterChange}
            />
          </div>
        </div>
      </div>

      {/* Top-level KPIs */}
      <section aria-labelledby="system-overview-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="system-overview-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            System overview
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Total users"
            value={formatInteger(systemStatistics.totalUsers)}
            helperText={`${
              systemStatistics.growthRate.users >= 0 ? "↑" : "↓"
            } ${formatDecimal(Math.abs(systemStatistics.growthRate.users))}% vs previous period`}
            tone={
              systemStatistics.growthRate.users >= 0 ? "positive" : "negative"
            }
          />
          <StatCard
            label="Total tickets"
            value={formatInteger(systemStatistics.totalTickets)}
            helperText={`${
              systemStatistics.growthRate.tickets >= 0 ? "↑" : "↓"
            } ${formatDecimal(
              Math.abs(systemStatistics.growthRate.tickets)
            )}% vs previous period`}
            tone={
              systemStatistics.growthRate.tickets >= 0 ? "positive" : "negative"
            }
          />
          <StatCard
            label="Active sessions"
            value={formatInteger(systemStatistics.activeSessions)}
            helperText="Currently logged in"
          />
          <StatCard
            label="Avg. resolution time"
            value={`${formatDecimal(ticketStatistics.averageResolutionTime)}h`}
            helperText="Across all resolved tickets"
          />
        </div>
      </section>

      {/* User Statistics */}
      <section aria-labelledby="user-overview-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="user-overview-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            User overview
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-500">
            {formatInteger(userStatistics.total)} total users
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users by Status */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Users by status
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    // Disable slice labels to prevent overlap on small charts
                    label={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {userStatusData.map((entry) => (
                      <Cell
                         
                        key={`user-status-${entry.name}`}
                        fill={STATUS_COLORS[entry.name] || COLORS.primary}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:text-sm">
              {userStatusData.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[entry.name] || COLORS.primary }}
                  />
                  <span className="truncate">
                    {entry.name}
                    <span className="ml-1 text-neutral-400 dark:text-neutral-500">
                      ({entry.value})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Users by Role */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Users by role
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userRoleData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.primary} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* User Registrations Over Time */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
            Registrations ({timeframeConfig.label.toLowerCase()})
          </h3>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={userStatistics.registrationsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.primary}
                  name="Registrations"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Ticket Statistics */}
      <section aria-labelledby="ticket-overview-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="ticket-overview-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Ticket overview
          </h2>
          <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-neutral-500 dark:text-neutral-500">
            <span>{formatInteger(ticketStatistics.total)} total tickets</span>
            <span className="hidden xs:inline">•</span>
            <span>{formatDecimal(ticketClosureRate)}% closed / resolved</span>
            <span className="hidden sm:inline">•</span>
            <span>{formatDecimal(ticketsPerUser)} tickets per user</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tickets by Status */}
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
                  <Bar dataKey="value" fill={COLORS.secondary} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tickets by Priority & Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
                Tickets by priority
              </h3>
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ticketPriorityData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent = 0 }) =>
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {ticketPriorityData.map((entry, index) => {
                        const colors = [
                          COLORS.success,
                          COLORS.warning,
                          COLORS.error,
                          COLORS.info,
                        ];
                        return (
                          <Cell
                             
                            key={`ticket-priority-${entry.name}`}
                            fill={colors[index % colors.length]}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip />
                  </PieChart>
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
        </div>

        {/* Ticket Activity Over Time */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 sm:p-6">
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
                <Line
                  type="monotone"
                  dataKey="created"
                  stroke={COLORS.primary}
                  name="Created"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  stroke={COLORS.success}
                  name="Resolved"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Additional System Stats */}
      <section aria-labelledby="system-detail-heading" className="space-y-3">
        <h2
          id="system-detail-heading"
          className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          System detail
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total groups"
            value={formatInteger(systemStatistics.totalGroups)}
          />
          <StatCard
            label="Total comments"
            value={formatInteger(systemStatistics.totalComments)}
          />
          <StatCard
            label="Enabled modules"
            value={formatInteger(systemStatistics.enabledModules)}
            helperText={`of ${formatInteger(systemStatistics.totalModules)} total`}
          />
          <StatCard
            label="Group memberships"
            value={formatInteger(systemStatistics.totalGroupMemberships)}
          />
        </div>
      </section>
    </div>
  );
}
