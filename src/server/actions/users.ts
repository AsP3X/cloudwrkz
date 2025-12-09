"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";

/**
 * Get all users (for agents to create tickets for users)
 */
export async function getAllUsers() {
  await requireAuth();

  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get all agents (users with AGENT, ADMIN, or MODERATOR roles)
 */
export async function getAgents() {
  await requireAuth();

  return prisma.user.findMany({
    where: {
      role: {
        in: ["AGENT", "ADMIN", "MODERATOR"],
      },
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get user effective permissions (admin only)
 */
export async function getUserEffectivePermissions(userId: string) {
  const { requireRole } = await import("@/lib/utils/auth-server");
  await requireRole("ADMIN");
  
  const { getUserPermissions } = await import("@/lib/utils/permissions");
  const permissions = await getUserPermissions(userId);
  
  return Array.from(permissions);
}
