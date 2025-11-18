"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

export type SearchResult = {
  type: "ticket" | "module";
  id: string;
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
};

/**
 * Global search across all enabled modules
 * Currently supports tickets, extensible for future modules
 */
export async function globalSearch(query: string, limit: number = 10): Promise<SearchResponse> {
  const user = await requireAuth();
  
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0 };
  }

  const searchTerm = query.trim();
  const results: SearchResult[] = [];

  // Search tickets if module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  if (ticketsEnabled) {
    const ticketResults = await searchTickets(searchTerm, user, limit);
    results.push(...ticketResults);
  }

  // Future: Add search for other modules here
  // Example:
  // const accountingEnabled = await isModuleEnabled(MODULE_KEYS.ACCOUNTING);
  // if (accountingEnabled) {
  //   const accountingResults = await searchAccounting(searchTerm, user, limit);
  //   results.push(...accountingResults);
  // }

  return {
    results: results.slice(0, limit),
    total: results.length,
  };
}

/**
 * Search tickets by title, description, ticketNumber, and tags
 */
async function searchTickets(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number
): Promise<SearchResult[]> {
  const searchConditions = {
    OR: [
      { title: { contains: searchTerm, mode: "insensitive" } },
      { description: { contains: searchTerm, mode: "insensitive" } },
      { ticketNumber: { contains: searchTerm, mode: "insensitive" } },
      { tags: { hasSome: [searchTerm] } },
    ],
  };

  const where: any = {};

  // For agents, apply group membership filter
  if (user.role === "AGENT") {
    // Get groups the agent is a member of
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const agentGroupIds = memberships.map((m) => m.groupId);

    // Agents can only see tickets that:
    // 1. Are not assigned to any group (assignedToGroupId is null), OR
    // 2. Are assigned to a group the agent is a member of
    const groupFilter = {
      OR: [
        { assignedToGroupId: null },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : []),
      ],
    };

    where.AND = [groupFilter, searchConditions];
  } else if (user.role === "USER") {
    // Regular users can only see tickets they created
    where.AND = [{ createdById: user.id }, searchConditions];
  } else {
    // ADMIN and MODERATOR can see all tickets
    Object.assign(where, searchConditions);
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: limit,
  });

  return tickets.map((ticket) => ({
    type: "ticket" as const,
    id: ticket.id,
    title: ticket.title,
    description: ticket.description || undefined,
    url: `/dashboard/tickets/${ticket.id}`,
    metadata: {
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      createdBy: ticket.createdBy.name || ticket.createdBy.email,
      assignedTo: ticket.assignedTo?.name || ticket.assignedTo?.email,
      commentCount: ticket._count.comments,
    },
  }));
}
