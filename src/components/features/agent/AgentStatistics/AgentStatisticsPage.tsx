"use client";

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { getAgentStatistics } from "@/server/actions/agent/statistics";

type AgentStatistics = Awaited<ReturnType<typeof getAgentStatistics>>;

const COLORS = {
  primary: "#3b82f6",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
} as const;

const STATUS_COLORS: Record<string, string> = {
  OPEN: COLORS.primary,
  IN_PROGRESS: COLORS.warning,
  PENDING: COLORS.info,
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

interface AgentStatisticsPageProps {
  stats: AgentStatistics;
}

export function AgentStatisticsPage({ stats }: AgentStatisticsPageProps) {
  const { tickets, time } = stats;

  const ticketStatusData = Object.entries(tickets.byStatus).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketPriorityData = Object.entries(tickets.byPriority).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketTypeData = Object.entries(tickets.byType).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketActivityData = React.useMemo(() => {
    const dateMap = new Map<
      string,
      { date: string; created: number; resolved: number }
    >();

    tickets.createdByDay.forEach((item) => {
      dateMap.set(item.date, {
        date: item.date,
        created: item.count,
        resolved: 0,
      });
    });

    tickets.resolvedByDay.forEach((item) => {
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
  }, [tickets.createdByDay, tickets.resolvedByDay]);

  const timeByDayData = time.hoursByDayLast7Days;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            My statistics
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Personal overview of your tickets and time tracking performance.
          </p>
        </div>
      </div>

      {/* Top-level KPIs */}
      <section aria-labelledby="agent-overview-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="agent-overview-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Overview
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Assigned tickets"
            value={formatInteger(tickets.totalAssigned)}
            helperText={`${formatInteger(
              tickets.byStatus.OPEN + tickets.byStatus.IN_PROGRESS + tickets.byStatus.PENDING
            )} currently open`}
          />
          <StatCard
            label="Resolved / closed"
            value={formatInteger(
              tickets.byStatus.RESOLVED + tickets.byStatus.CLOSED + tickets.byStatus.CANCELLED
            )}
            helperText={`Avg. resolution time ${formatDecimal(
              tickets.averageResolutionTime
            )}h`}
          />
          <StatCard
            label="Hours tracked (7 days)"
            value={`${formatDecimal(time.totalHoursLast7Days)}h`}
            helperText={
              time.timeTrackingEnabled
                ? "Based on your time entries"
                : "Time tracking module is disabled"
            }
          />
          <StatCard
            label="Hours tracked (30 days)"
            value={`${formatDecimal(time.totalHoursLast30Days)}h`}
            helperText={time.timeTrackingEnabled ? undefined : "No time data available"}
          />
        </div>
      </section>

      {/* Ticket statistics */}
      <section aria-labelledby="agent-ticket-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="agent-ticket-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Ticket performance
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-500">
            Tickets where you are the assignee
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tickets by status */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Tickets by status
            </h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.primary} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ticket activity over time */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3 sm:mb-4">
              Ticket activity (last 30 days)
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
        </div>

        {/* Ticket mix */}
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

      {/* Time statistics */}
      <section aria-labelledby="agent-time-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="agent-time-heading"
            className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
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

