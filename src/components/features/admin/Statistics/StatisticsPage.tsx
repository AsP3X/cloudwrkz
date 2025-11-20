"use client";

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type {
  getUserStatistics,
  getTicketStatistics,
  getSystemStatistics,
} from "@/server/actions/admin/statistics";

type UserStatistics = Awaited<ReturnType<typeof getUserStatistics>>;
type TicketStatistics = Awaited<ReturnType<typeof getTicketStatistics>>;
type SystemStatistics = Awaited<ReturnType<typeof getSystemStatistics>>;

interface StatisticsPageProps {
  userStatistics: UserStatistics;
  ticketStatistics: TicketStatistics;
  systemStatistics: SystemStatistics;
}

const COLORS = {
  primary: "#3b82f6",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
};

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

export function StatisticsPage({
  userStatistics,
  ticketStatistics,
  systemStatistics,
}: StatisticsPageProps) {
  // Prepare data for charts
  const userStatusData = Object.entries(userStatistics.byStatus).map(([name, value]) => ({
    name,
    value,
  }));

  const userRoleData = Object.entries(userStatistics.byRole).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketStatusData = Object.entries(ticketStatistics.byStatus).map(([name, value]) => ({
    name: name.replace("_", " "),
    value,
  }));

  const ticketPriorityData = Object.entries(ticketStatistics.byPriority).map(([name, value]) => ({
    name,
    value,
  }));

  const ticketTypeData = Object.entries(ticketStatistics.byType).map(([name, value]) => ({
    name,
    value,
  }));

  // Merge ticket activity data for comparison chart
  const ticketActivityData = React.useMemo(() => {
    const dateMap = new Map<string, { date: string; created: number; resolved: number }>();
    
    ticketStatistics.createdByDay.forEach((item) => {
      dateMap.set(item.date, { date: item.date, created: item.count, resolved: 0 });
    });
    
    ticketStatistics.resolvedByDay.forEach((item) => {
      const existing = dateMap.get(item.date);
      if (existing) {
        existing.resolved = item.count;
      } else {
        dateMap.set(item.date, { date: item.date, created: 0, resolved: item.count });
      }
    });
    
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [ticketStatistics.createdByDay, ticketStatistics.resolvedByDay]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Statistics</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Comprehensive system analytics and metrics
        </p>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Users</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.totalUsers.toLocaleString()}
          </p>
          <p className={`text-sm mt-1 ${systemStatistics.growthRate.users >= 0 ? "text-success-600" : "text-error-600"}`}>
            {systemStatistics.growthRate.users >= 0 ? "↑" : "↓"} {Math.abs(systemStatistics.growthRate.users)}% growth
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.totalTickets.toLocaleString()}
          </p>
          <p className={`text-sm mt-1 ${systemStatistics.growthRate.tickets >= 0 ? "text-success-600" : "text-error-600"}`}>
            {systemStatistics.growthRate.tickets >= 0 ? "↑" : "↓"} {Math.abs(systemStatistics.growthRate.tickets)}% growth
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Active Sessions</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.activeSessions.toLocaleString()}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">Currently logged in</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Avg Resolution Time</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {ticketStatistics.averageResolutionTime.toLocaleString()}h
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">Ticket resolution</p>
        </div>
      </div>

      {/* User Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users by Status */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Users by Status
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={userStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {userStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS.primary} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Users by Role */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Users by Role
          </h2>
          <ResponsiveContainer width="100%" height={300}>
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

      {/* User Registrations Over Time */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          User Registrations (Last 30 Days)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={userStatistics.registrationsByDay}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="count" stroke={COLORS.primary} name="Registrations" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Ticket Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by Status */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Tickets by Status
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ticketStatusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill={COLORS.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tickets by Priority */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Tickets by Priority
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={ticketPriorityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {ticketPriorityData.map((entry, index) => {
                  const colors = [COLORS.success, COLORS.warning, COLORS.error, COLORS.info];
                  return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                })}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tickets by Type */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Tickets by Type
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ticketTypeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill={COLORS.info} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ticket Activity Over Time */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Ticket Activity (Last 30 Days)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
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

      {/* Additional System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Groups</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.totalGroups.toLocaleString()}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Comments</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.totalComments.toLocaleString()}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Group Memberships</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {systemStatistics.totalGroupMemberships.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
