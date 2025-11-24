"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";

export type SystemInfo = {
  totalUsers: number;
  totalTickets: number;
  totalGroups: number;
  totalModules: number;
  enabledModules: number;
  activeSessions: number;
  databaseSize?: string;
};

export type DatabaseStats = {
  users: number;
  sessions: number;
  tickets: number;
  ticketComments: number;
  groups: number;
  groupMemberships: number;
  modules: number;
};

/**
 * Get system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  await requireRole("ADMIN");

  const [
    totalUsers,
    totalTickets,
    totalGroups,
    totalModules,
    enabledModules,
    activeSessions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.group.count(),
    prisma.module.count(),
    prisma.module.count({ where: { enabled: true } }),
    prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    }),
  ]);

  return {
    totalUsers,
    totalTickets,
    totalGroups,
    totalModules,
    enabledModules,
    activeSessions,
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<DatabaseStats> {
  await requireRole("ADMIN");

  const [
    users,
    sessions,
    tickets,
    ticketComments,
    groups,
    groupMemberships,
    modules,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.ticket.count(),
    prisma.ticketComment.count(),
    prisma.group.count(),
    prisma.groupMembership.count(),
    prisma.module.count(),
  ]);

  return {
    users,
    sessions,
    tickets,
    ticketComments,
    groups,
    groupMemberships,
    modules,
  };
}

/**
 * Purge deleted accounts (manual trigger)
 */
export async function purgeDeletedAccounts(): Promise<{ success: boolean; message: string; deletedCount: number }> {
  await requireRole("ADMIN");

  // Find users scheduled for deletion (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const deletedUsers = await prisma.user.findMany({
    where: {
      status: "DELETED",
      scheduledForDeletionAt: {
        lte: thirtyDaysAgo,
      },
    },
    select: {
      id: true,
    },
  });

  const deletedCount = deletedUsers.length;

  if (deletedCount === 0) {
    return {
      success: true,
      message: "No accounts to purge",
      deletedCount: 0,
    };
  }

  // Delete sessions first
  await prisma.session.deleteMany({
    where: {
      userId: {
        in: deletedUsers.map((u) => u.id),
      },
    },
  });

  // Delete users (cascading deletes will handle related data)
  await prisma.user.deleteMany({
    where: {
      id: {
        in: deletedUsers.map((u) => u.id),
      },
    },
  });

  revalidatePath("/dashboard/admin/settings");

  return {
    success: true,
    message: `Successfully purged ${deletedCount} deleted account(s)`,
    deletedCount,
  };
}

/**
 * Get system health status
 */
export async function getSystemHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: boolean;
    sessions: boolean;
    modules: boolean;
  };
  message: string;
}> {
  await requireRole("ADMIN");

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check if there are any modules
    const moduleCount = await prisma.module.count();
    const hasModules = moduleCount > 0;

    // Check active sessions
    const activeSessions = await prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    const checks = {
      database: true,
      sessions: true,
      modules: hasModules,
    };

    const allHealthy = Object.values(checks).every((check) => check);

    return {
      status: allHealthy ? "healthy" : "degraded",
      checks,
      message: allHealthy
        ? "All systems operational"
        : "Some systems may be experiencing issues",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      checks: {
        database: false,
        sessions: false,
        modules: false,
      },
      message: "System health check failed",
    };
  }
}
