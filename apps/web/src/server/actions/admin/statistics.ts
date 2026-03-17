"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import type { StatisticsTimeframe } from "@/lib/constants/statistics";

export type TimeSeriesData = {
  date: string;
  users: number;
  tickets: number;
  registrations: number;
};

export type UserStatistics = {
  total: number;
  byStatus: {
    ACTIVE: number;
    PENDING: number;
    SUSPENDED: number;
    DELETED: number;
  };
  byRole: {
    USER: number;
    AGENT: number;
    ADMIN: number;
    MODERATOR: number;
  };
  registrationsByDay: Array<{ date: string; count: number }>;
  registrationsByMonth: Array<{ month: string; count: number }>;
};

export type TicketStatistics = {
  total: number;
  byStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    PENDING: number;
    RESOLVED: number;
    CLOSED: number;
    CANCELLED: number;
  };
  byPriority: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    URGENT: number;
  };
  byType: {
    BUG: number;
    FEATURE: number;
    QUESTION: number;
    SUPPORT: number;
    TASK: number;
  };
  createdByDay: Array<{ date: string; count: number }>;
  createdByMonth: Array<{ month: string; count: number }>;
  resolvedByDay: Array<{ date: string; count: number }>;
  averageResolutionTime: number; // in hours
};

export type SystemStatistics = {
  totalUsers: number;
  totalTickets: number;
  totalGroups: number;
  totalModules: number;
  enabledModules: number;
  activeSessions: number;
  totalComments: number;
  totalGroupMemberships: number;
  growthRate: {
    users: number; // percentage
    tickets: number; // percentage
  };
};

type TicketStatusFilter =
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

type StatisticsOptions = {
  timeframe?: StatisticsTimeframe;
  status?: TicketStatusFilter;
};

function getFromDateForTimeframe(timeframe: StatisticsTimeframe): Date {
  const now = new Date();

  const daysMap: Record<StatisticsTimeframe, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365,
  };

  const days = daysMap[timeframe] ?? 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return from;
}

/**
 * Get detailed user statistics
 */
export async function getUserStatistics(options?: StatisticsOptions): Promise<UserStatistics> {
  await requireRole("ADMIN");
  const { requirePermission } = await import("@/lib/utils/auth-server");
  await requirePermission("admin.statistics.view");

  const timeframe = options?.timeframe ?? "30d";
  const thirtyDaysAgo = getFromDateForTimeframe(timeframe);

  // Get total users
  const totalUsers = await prisma.user.count();

  // Get users by status
  const usersByStatus = await prisma.user.groupBy({
    by: ["status"],
    _count: true,
  });

  const statusMap = {
    ACTIVE: 0,
    PENDING: 0,
    SUSPENDED: 0,
    DELETED: 0,
  };

  usersByStatus.forEach((group) => {
    statusMap[group.status as keyof typeof statusMap] = group._count;
  });

  // Get users by role
  const usersByRole = await prisma.user.groupBy({
    by: ["role"],
    _count: true,
  });

  const roleMap = {
    USER: 0,
    AGENT: 0,
    ADMIN: 0,
    MODERATOR: 0,
  };

  usersByRole.forEach((group) => {
    roleMap[group.role as keyof typeof roleMap] = group._count;
  });

  // Get registrations by day (timeframe window)
  const registrations = await prisma.user.findMany({
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      createdAt: true,
    },
  });

  const registrationsByDayMap = new Map<string, number>();
  registrations.forEach((user) => {
    const date = new Date(user.createdAt).toISOString().split("T")[0];
    registrationsByDayMap.set(date, (registrationsByDayMap.get(date) || 0) + 1);
  });

  const registrationsByDay = Array.from(registrationsByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Get registrations by month (within timeframe window)
  const registrationsByMonthMap = new Map<string, number>();
  registrations.forEach((user) => {
    const date = new Date(user.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    registrationsByMonthMap.set(month, (registrationsByMonthMap.get(month) || 0) + 1);
  });

  const registrationsByMonth = Array.from(registrationsByMonthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    total: totalUsers,
    byStatus: statusMap,
    byRole: roleMap,
    registrationsByDay,
    registrationsByMonth,
  };
}

/**
 * Get detailed ticket statistics
 */
export async function getTicketStatistics(options?: StatisticsOptions): Promise<TicketStatistics> {
  await requireRole("ADMIN");
  const { requirePermission } = await import("@/lib/utils/auth-server");
  await requirePermission("admin.statistics.view");

  const timeframe = options?.timeframe ?? "30d";
  const thirtyDaysAgo = getFromDateForTimeframe(timeframe);
  const statusFilter = options?.status;

  // Get total tickets (respect timeframe and status filter if provided)
  const totalTickets = await prisma.ticket.count({
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  // Get tickets by status
  const ticketsByStatus = await prisma.ticket.groupBy({
    by: ["status"],
    _count: true,
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  const statusMap = {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING: 0,
    RESOLVED: 0,
    CLOSED: 0,
    CANCELLED: 0,
  };

  ticketsByStatus.forEach((group) => {
    statusMap[group.status as keyof typeof statusMap] = group._count;
  });

  // Get tickets by priority
  const ticketsByPriority = await prisma.ticket.groupBy({
    by: ["priority"],
    _count: true,
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  const priorityMap = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  ticketsByPriority.forEach((group) => {
    priorityMap[group.priority as keyof typeof priorityMap] = group._count;
  });

  // Get tickets by type
  const ticketsByType = await prisma.ticket.groupBy({
    by: ["type"],
    _count: true,
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
  });

  const typeMap = {
    BUG: 0,
    FEATURE: 0,
    QUESTION: 0,
    SUPPORT: 0,
    TASK: 0,
  };

  ticketsByType.forEach((group) => {
    typeMap[group.type as keyof typeof typeMap] = group._count;
  });

  // Get tickets created by day (timeframe window, respect status filter)
  const tickets = await prisma.ticket.findMany({
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    select: {
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
    },
  });

  const createdByDayMap = new Map<string, number>();
  tickets.forEach((ticket) => {
    const date = new Date(ticket.createdAt).toISOString().split("T")[0];
    createdByDayMap.set(date, (createdByDayMap.get(date) || 0) + 1);
  });

  const createdByDay = Array.from(createdByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Get tickets created by month (last 6 months)
  const createdByMonthMap = new Map<string, number>();
  tickets.forEach((ticket) => {
    const date = new Date(ticket.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    createdByMonthMap.set(month, (createdByMonthMap.get(month) || 0) + 1);
  });

  const createdByMonth = Array.from(createdByMonthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Get resolved tickets by day
  const resolvedTickets = tickets.filter(
    (t) => t.resolvedAt || t.closedAt
  );

  const resolvedByDayMap = new Map<string, number>();
  resolvedTickets.forEach((ticket) => {
    const resolvedDate = ticket.resolvedAt || ticket.closedAt;
    if (resolvedDate) {
      const date = new Date(resolvedDate).toISOString().split("T")[0];
      resolvedByDayMap.set(date, (resolvedByDayMap.get(date) || 0) + 1);
    }
  });

  const resolvedByDay = Array.from(resolvedByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate average resolution time (respect timeframe and status filter)
  const resolvedTicketsWithTime = await prisma.ticket.findMany({
    where: {
      OR: [
        { resolvedAt: { not: null } },
        { closedAt: { not: null } },
      ],
      createdAt: {
        gte: thirtyDaysAgo,
      },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    select: {
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
    },
  });

  let totalResolutionTime = 0;
  let resolvedCount = 0;

  resolvedTicketsWithTime.forEach((ticket) => {
    const resolvedDate = ticket.resolvedAt || ticket.closedAt;
    if (resolvedDate) {
      const created = new Date(ticket.createdAt).getTime();
      const resolved = new Date(resolvedDate).getTime();
      const hours = (resolved - created) / (1000 * 60 * 60);
      totalResolutionTime += hours;
      resolvedCount++;
    }
  });

  const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;

  return {
    total: totalTickets,
    byStatus: statusMap,
    byPriority: priorityMap,
    byType: typeMap,
    createdByDay,
    createdByMonth,
    resolvedByDay,
    averageResolutionTime: Math.round(averageResolutionTime * 10) / 10,
  };
}

/**
 * Get system statistics
 */
export async function getSystemStatistics(options?: StatisticsOptions): Promise<SystemStatistics> {
  await requireRole("ADMIN");
  const { requirePermission } = await import("@/lib/utils/auth-server");
  await requirePermission("admin.statistics.view");

  const timeframe = options?.timeframe ?? "30d";
  const now = new Date();
  const thirtyDaysAgo = getFromDateForTimeframe(timeframe);

  const [
    totalUsers,
    totalTickets,
    totalGroups,
    totalModules,
    enabledModules,
    activeSessions,
    totalComments,
    totalGroupMemberships,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.group.count(),
    prisma.module.count(),
    prisma.module.count({ where: { enabled: true } }),
    prisma.session.count({
      where: {
        expiresAt: {
          gt: now,
        },
      },
    }),
    prisma.ticketComment.count(),
    prisma.groupMembership.count(),
  ]);

  // Calculate growth rates
  const usersLastMonth = await prisma.user.count({
    where: {
      createdAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  const ticketsLastMonth = await prisma.ticket.count({
    where: {
      createdAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  const usersGrowthRate =
    usersLastMonth > 0
      ? ((totalUsers - usersLastMonth) / usersLastMonth) * 100
      : 0;

  const ticketsGrowthRate =
    ticketsLastMonth > 0
      ? ((totalTickets - ticketsLastMonth) / ticketsLastMonth) * 100
      : 0;

  return {
    totalUsers,
    totalTickets,
    totalGroups,
    totalModules,
    enabledModules,
    activeSessions,
    totalComments,
    totalGroupMemberships,
    growthRate: {
      users: Math.round(usersGrowthRate * 10) / 10,
      tickets: Math.round(ticketsGrowthRate * 10) / 10,
    },
  };
}
