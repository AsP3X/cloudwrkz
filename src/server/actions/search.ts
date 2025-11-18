"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

export type SearchResult = {
  type: "ticket" | "module" | "user";
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

export type SearchFilters = {
  query?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignedToId?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
};

/**
 * Global search across all enabled modules
 * Currently supports tickets and users, extensible for future modules
 */
export async function globalSearch(query: string, limit: number = 10): Promise<SearchResponse> {
  const user = await requireAuth();
  
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0 };
  }

  const searchTerm = query.trim();
  const results: SearchResult[] = [];
  let totalCount = 0;

  // Distribute limit between users and tickets (roughly 40% users, 60% tickets)
  const userLimit = Math.max(1, Math.floor(limit * 0.4));
  const ticketLimit = limit - userLimit;

  // Search users if user is agent/admin/moderator
  if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
    const userResults = await searchUsers(searchTerm, user);
    totalCount += userResults.length;
    // Limit user results to allocated portion
    results.push(...userResults.slice(0, userLimit));
  }

  // Search tickets if module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  if (ticketsEnabled) {
    const ticketResults = await searchTickets(searchTerm, user, ticketLimit);
    totalCount += ticketResults.length;
    results.push(...ticketResults);
  }

  // Future: Add search for other modules here
  // Example:
  // const accountingEnabled = await isModuleEnabled(MODULE_KEYS.ACCOUNTING);
  // if (accountingEnabled) {
  //   const accountingResults = await searchAccounting(searchTerm, user, limit);
  //   totalCount += accountingResults.length;
  //   results.push(...accountingResults);
  // }

  return {
    results: results.slice(0, limit),
    total: totalCount,
  };
}

/**
 * Advanced search with filters
 */
export async function advancedSearch(filters: SearchFilters): Promise<SearchResponse> {
  const user = await requireAuth();
  
  const searchTerm = filters.query?.trim() || "";
  const results: SearchResult[] = [];

  // Search users if query is provided (only for agents/admins/moderators)
  // Users can be searched even when only filters are applied, as long as there's a query
  if (searchTerm && (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR")) {
    const userResults = await searchUsers(searchTerm, user);
    results.push(...userResults);
  }

  // Search tickets if module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  if (ticketsEnabled) {
    const ticketResults = await searchTicketsWithFilters(searchTerm, user, filters);
    results.push(...ticketResults);
  }

  return {
    results,
    total: results.length,
  };
}

/**
 * Search users by name and email
 */
async function searchUsers(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>
): Promise<SearchResult[]> {
  // Only agents and admins can search for users
  if (user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { email: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        {
          status: {
            in: ["ACTIVE", "PENDING"],
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          createdTickets: true,
          assignedTickets: true,
        },
      },
    },
    orderBy: [
      { name: "asc" },
      { email: "asc" },
    ],
    take: 20,
  });

  return users.map((u) => ({
    type: "user" as const,
    id: u.id,
    title: u.name || u.email,
    description: u.email !== (u.name || u.email) ? u.email : undefined,
    url: `/dashboard/users/${u.id}`, // Link to user detail page
    metadata: {
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdTicketsCount: u._count.createdTickets,
      assignedTicketsCount: u._count.assignedTickets,
      createdAt: u.createdAt,
    },
  }));
}

/**
 * Search tickets with filters
 */
async function searchTicketsWithFilters(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  filters: SearchFilters
): Promise<SearchResult[]> {
  const searchConditions: any[] = [];

  // Build search conditions
  if (searchTerm) {
    searchConditions.push(
      { title: { contains: searchTerm, mode: "insensitive" } },
      { description: { contains: searchTerm, mode: "insensitive" } },
      { ticketNumber: { contains: searchTerm, mode: "insensitive" } },
      { tags: { hasSome: [searchTerm] } }
    );
  }

  const where: any = {};

  // Apply filters
  if (filters.status) {
    if (filters.status === "UNRESOLVED") {
      where.status = { in: ["OPEN", "IN_PROGRESS", "PENDING"] };
    } else {
      where.status = filters.status;
    }
  }
  if (filters.priority) {
    where.priority = filters.priority;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  // Date filtering for created date
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = new Date(filters.createdFrom);
    }
    if (filters.createdTo) {
      const endDate = new Date(filters.createdTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  // Date filtering for updated date
  if (filters.updatedFrom || filters.updatedTo) {
    where.updatedAt = {};
    if (filters.updatedFrom) {
      where.updatedAt.gte = new Date(filters.updatedFrom);
    }
    if (filters.updatedTo) {
      const endDate = new Date(filters.updatedTo);
      endDate.setHours(23, 59, 59, 999);
      where.updatedAt.lte = endDate;
    }
  }

  // Combine search conditions with filters
  if (searchConditions.length > 0) {
    where.AND = where.AND || [];
    where.AND.push({ OR: searchConditions });
  }

  // For agents, apply group membership filter
  if (user.role === "AGENT") {
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const agentGroupIds = memberships.map((m) => m.groupId);

    const groupFilter = {
      OR: [
        { assignedToGroupId: null },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : []),
      ],
    };

    where.AND = where.AND || [];
    where.AND.unshift(groupFilter);
  } else if (user.role === "USER") {
    // Regular users can only see tickets they created
    where.createdById = user.id;
  }

  // Determine sort order
  const sortBy = filters.sortBy || "updatedAt";
  const sortOrder = filters.sortOrder || "desc";
  const limit = filters.limit || 100;

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
      assignedToGroup: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      [sortBy]: sortOrder,
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
      assignedToGroup: ticket.assignedToGroup?.name,
      commentCount: ticket._count.comments,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    },
  }));
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
