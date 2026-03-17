"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAnyRole } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "../modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import type { StatisticsTimeframe } from "@/lib/constants/statistics";

export type AgentTicketStatistics = {
  totalAssigned: number;
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
  resolvedByDay: Array<{ date: string; count: number }>;
  averageResolutionTime: number; // hours
};

export type AgentTimeStatistics = {
  timeTrackingEnabled: boolean;
  totalHoursLast7Days: number;
  totalHoursLast30Days: number;
  hoursByDayLast7Days: Array<{ date: string; hours: number }>;
};

export type AgentStatistics = {
  tickets: AgentTicketStatistics;
  time: AgentTimeStatistics;
};

type AgentStatisticsOptions = {
  timeframe?: StatisticsTimeframe;
  status?: AgentTicketStatusFilter;
};

type AgentTicketStatusFilter =
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING"
  | "RESOLVED"
  | "CLOSED"
  | "CANCELLED";

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

export async function getAgentStatistics(
  options?: AgentStatisticsOptions
): Promise<AgentStatistics> {
  const user = await requireAnyRole("AGENT", "ADMIN", "MODERATOR", "USER");

  const now = new Date();
  const timeframe = options?.timeframe ?? "30d";
  const ticketFromDate = getFromDateForTimeframe(timeframe);
  const statusFilter = options?.status;
  const thirtyDaysAgoForTime = new Date(now);
  thirtyDaysAgoForTime.setDate(thirtyDaysAgoForTime.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Ticket statistics for tickets assigned to the current user
  const [
    totalAssigned,
    ticketsByStatus,
    ticketsByPriority,
    ticketsByType,
    recentTickets,
    resolvedTicketsForTime,
  ] = await Promise.all([
    prisma.ticket.count({
      where: {
        assignedToId: user.id,
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      _count: true,
      where: {
        assignedToId: user.id,
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      _count: true,
      where: {
        assignedToId: user.id,
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    prisma.ticket.groupBy({
      by: ["type"],
      _count: true,
      where: {
        assignedToId: user.id,
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
    prisma.ticket.findMany({
      where: {
        assignedToId: user.id,
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        assignedToId: user.id,
        OR: [
          { resolvedAt: { not: null } },
          { closedAt: { not: null } },
        ],
        createdAt: {
          gte: ticketFromDate,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      select: {
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    }),
  ]);

  const statusMap = {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING: 0,
    RESOLVED: 0,
    CLOSED: 0,
    CANCELLED: 0,
  };

  ticketsByStatus.forEach((group) => {
    statusMap[group.status] = group._count;
  });

  const priorityMap = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };

  ticketsByPriority.forEach((group) => {
    priorityMap[group.priority] = group._count;
  });

  const typeMap = {
    BUG: 0,
    FEATURE: 0,
    QUESTION: 0,
    SUPPORT: 0,
    TASK: 0,
  };

  ticketsByType.forEach((group) => {
    typeMap[group.type] = group._count;
  });

  const createdByDayMap = new Map<string, number>();
  const resolvedByDayMap = new Map<string, number>();

  recentTickets.forEach((ticket) => {
    const createdDate = new Date(ticket.createdAt).toISOString().split("T")[0];
    createdByDayMap.set(createdDate, (createdByDayMap.get(createdDate) || 0) + 1);

    const resolvedDate = ticket.resolvedAt || ticket.closedAt;
    if (resolvedDate) {
      const date = new Date(resolvedDate).toISOString().split("T")[0];
      resolvedByDayMap.set(date, (resolvedByDayMap.get(date) || 0) + 1);
    }
  });

  const createdByDay = Array.from(createdByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const resolvedByDay = Array.from(resolvedByDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Average resolution time for this agent
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  resolvedTicketsForTime.forEach((ticket) => {
    const resolvedDate = ticket.resolvedAt || ticket.closedAt;
    if (resolvedDate) {
      const created = new Date(ticket.createdAt).getTime();
      const resolved = new Date(resolvedDate).getTime();
      const hours = (resolved - created) / (1000 * 60 * 60);
      totalResolutionTime += hours;
      resolvedCount++;
    }
  });

  const averageResolutionTime =
    resolvedCount > 0 ? Math.round((totalResolutionTime / resolvedCount) * 10) / 10 : 0;

  const ticketStats: AgentTicketStatistics = {
    totalAssigned,
    byStatus: statusMap,
    byPriority: priorityMap,
    byType: typeMap,
    createdByDay,
    resolvedByDay,
    averageResolutionTime,
  };

  // Time tracking statistics
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);

  if (!timeTrackingEnabled) {
    return {
      tickets: ticketStats,
      time: {
        timeTrackingEnabled: false,
        totalHoursLast7Days: 0,
        totalHoursLast30Days: 0,
        hoursByDayLast7Days: [],
      },
    };
  }

  const [
    timeLast7Days,
    timeLast30Days,
    entriesLast7Days,
  ] = await Promise.all([
    prisma.timeEntry.aggregate({
      _sum: {
        totalDuration: true,
      },
      where: {
        userId: user.id,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
    }),
    prisma.timeEntry.aggregate({
      _sum: {
        totalDuration: true,
      },
      where: {
        userId: user.id,
        createdAt: {
          gte: thirtyDaysAgoForTime,
        },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: sevenDaysAgo,
        },
      },
      select: {
        createdAt: true,
        totalDuration: true,
      },
    }),
  ]);

  const totalSecondsLast7 = timeLast7Days._sum.totalDuration || 0;
  const totalSecondsLast30 = timeLast30Days._sum.totalDuration || 0;

  const hoursByDayMap = new Map<string, number>();
  entriesLast7Days.forEach((entry) => {
    const date = new Date(entry.createdAt).toISOString().split("T")[0];
    const prev = hoursByDayMap.get(date) || 0;
    hoursByDayMap.set(date, prev + entry.totalDuration);
  });

  const hoursByDayLast7Days = Array.from(hoursByDayMap.entries())
    .map(([date, seconds]) => ({
      date,
      hours: Math.round((seconds / 3600) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const timeStats: AgentTimeStatistics = {
    timeTrackingEnabled: true,
    totalHoursLast7Days: Math.round((totalSecondsLast7 / 3600) * 10) / 10,
    totalHoursLast30Days: Math.round((totalSecondsLast30 / 3600) * 10) / 10,
    hoursByDayLast7Days,
  };

  return {
    tickets: ticketStats,
    time: timeStats,
  };
}

