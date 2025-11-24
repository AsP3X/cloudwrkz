"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";

export type AdminStats = {
  totalUsers: number;
  usersByStatus: {
    ACTIVE: number;
    PENDING: number;
    SUSPENDED: number;
    DELETED: number;
  };
  totalTickets: number;
  ticketsByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    PENDING: number;
    RESOLVED: number;
    CLOSED: number;
    CANCELLED: number;
  };
  activeSessions: number;
  enabledModules: number;
  totalModules: number;
  totalGroups: number;
  recentRegistrations: number; // Last 7 days
  recentTickets: number; // Last 7 days
};

/**
 * Get admin dashboard statistics
 */
export async function getAdminStats(): Promise<AdminStats> {
  await requireRole("ADMIN");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get user statistics
  const [totalUsers, usersByStatus] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const usersByStatusMap = {
    ACTIVE: 0,
    PENDING: 0,
    SUSPENDED: 0,
    DELETED: 0,
  };

  usersByStatus.forEach((group) => {
    usersByStatusMap[group.status as keyof typeof usersByStatusMap] = group._count;
  });

  // Get ticket statistics
  const [totalTickets, ticketsByStatus] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const ticketsByStatusMap = {
    OPEN: 0,
    IN_PROGRESS: 0,
    PENDING: 0,
    RESOLVED: 0,
    CLOSED: 0,
    CANCELLED: 0,
  };

  ticketsByStatus.forEach((group) => {
    ticketsByStatusMap[group.status as keyof typeof ticketsByStatusMap] = group._count;
  });

  // Get active sessions (non-expired)
  const activeSessions = await prisma.session.count({
    where: {
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  // Get enabled modules count and total modules
  const [enabledModules, totalModules] = await Promise.all([
    prisma.module.count({
      where: {
        enabled: true,
      },
    }),
    prisma.module.count(),
  ]);

  // Get total groups
  const totalGroups = await prisma.group.count();

  // Get recent registrations (last 7 days)
  const recentRegistrations = await prisma.user.count({
    where: {
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  // Get recent tickets (last 7 days)
  const recentTickets = await prisma.ticket.count({
    where: {
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  return {
    totalUsers,
    usersByStatus: usersByStatusMap,
    totalTickets,
    ticketsByStatus: ticketsByStatusMap,
    activeSessions,
    enabledModules,
    totalModules,
    totalGroups,
    recentRegistrations,
    recentTickets,
  };
}
