"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";

/**
 * Get all agents for ticket assignment
 * Returns users with AGENT, ADMIN, or MODERATOR roles
 * Includes ACTIVE and PENDING users (excludes SUSPENDED and DELETED)
 */
export async function getAgents() {
  await requireAuth();

  const agents = await prisma.user.findMany({
    where: {
      role: {
        in: ["AGENT", "ADMIN", "MODERATOR"],
      },
      status: {
        in: ["ACTIVE", "PENDING"], // Include both ACTIVE and PENDING users
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: [
      { role: "asc" }, // ADMIN first, then MODERATOR, then AGENT
      { name: "asc" },
      { email: "asc" },
    ],
  });

  return agents;
}
