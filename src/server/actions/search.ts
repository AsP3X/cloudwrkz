"use server";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { canUserViewModule } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { fuzzySearch, rankAndLimit } from "@/lib/utils/fuzzy-search";
import { getUserPermissions } from "@/lib/utils/permissions";
import { formatTimerNumber } from "@/lib/utils/time-tracking";

export type SearchResult = {
  type: "ticket" | "module" | "user" | "comment" | "timeentry" | "setting" | "task";
  id: string;
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
  parentTicketId?: string; // For comment results, link to parent ticket
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
 * Supports tickets, users, and time entries
 */
export async function globalSearch(query: string, limit: number = 10): Promise<SearchResponse> {
  const user = await requireAuth();
  
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0 };
  }

  const searchTerm = query.trim();
  const results: SearchResult[] = [];
  let totalCount = 0;

  // Distribute limit across different result types
  // Priority order: User, Tickets, Task, Timer, Other
  // 25% users, 30% tickets, 20% tasks, 15% time entries, 10% settings
  const userLimit = Math.max(1, Math.floor(limit * 0.25));
  const ticketLimit = Math.max(1, Math.floor(limit * 0.3));
  const taskLimit = Math.max(1, Math.floor(limit * 0.2));
  const timeEntryLimit = Math.max(1, Math.floor(limit * 0.15));
  const settingsLimit = Math.max(1, Math.floor(limit * 0.1));

  // Get user permissions
  const userPermissions = await getUserPermissions(user.id);

  // Search users - all authenticated users can search, but regular users can only find themselves
  const userResults = await searchUsers(searchTerm, user, userPermissions);
  totalCount += userResults.length;
  results.push(...userResults.slice(0, userLimit));

  // Search tickets if user can view tickets module
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  if (canViewTickets) {
    const ticketResults = await searchTickets(searchTerm, user, ticketLimit, userPermissions);
    totalCount += ticketResults.length;
    results.push(...ticketResults);
  }

  // Search todos (todo module)
  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TODOS);
  if (canViewTasks) {
    const taskResults = await searchTasks(searchTerm, user, taskLimit, userPermissions);
    totalCount += taskResults.length;
    results.push(...taskResults);
  }

  // Search time entries if user can view time tracking module
  const canViewTimeTracking = await canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING);
  if (canViewTimeTracking) {
    const timeEntryResults = await searchTimeEntries(searchTerm, user, timeEntryLimit, userPermissions);
    totalCount += timeEntryResults.length;
    results.push(...timeEntryResults);
  }

  // Search settings that are available to the current user
  const settingsResults = await searchSettings(searchTerm, user, settingsLimit);
  totalCount += settingsResults.length;
  results.push(...settingsResults);

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

  // Get user permissions
  const userPermissions = await getUserPermissions(user.id);

  // Search users if query is provided - all authenticated users can search
  // Regular users can only find themselves, agents/admins can find all users
  if (searchTerm) {
    const userResults = await searchUsers(searchTerm, user, userPermissions);
    results.push(...userResults);
  }

  // Search tickets if user can view tickets module
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  if (canViewTickets) {
    const ticketResults = await searchTicketsWithFilters(searchTerm, user, filters, userPermissions);
    results.push(...ticketResults);
  }

  // Search time entries if user can view time tracking module
  const canViewTimeTracking = await canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING);
  if (canViewTimeTracking) {
    const timeEntryResults = await searchTimeEntries(searchTerm, user, filters.limit || 100, userPermissions);
    results.push(...timeEntryResults);
  }

  // Search todos if user can view todos module
  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TODOS);
  if (canViewTasks && searchTerm) {
    const taskResults = await searchTasks(searchTerm, user, filters.limit || 100, userPermissions);
    results.push(...taskResults);
  }

  // Search settings that are available to the current user
  if (searchTerm) {
    const settingsResults = await searchSettings(searchTerm, user, filters.limit || 50);
    results.push(...settingsResults);
  }

  return {
    results,
    total: results.length,
  };
}

/**
 * Search users by name and email with fuzzy matching
 */
async function searchUsers(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  userPermissions: Set<string>
): Promise<SearchResult[]> {
  // Check if user can view all users (admins/agents/moderators) or only themselves
  const canViewAllUsers = user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR";

  // Build where clause based on permissions
  const where: any = {
    status: {
      in: ["ACTIVE", "PENDING"],
    },
  };

  // Regular users can only search for themselves
  if (!canViewAllUsers) {
    where.id = user.id;
  }

  // Fetch more candidates for fuzzy search (100 users for admins/agents, 1 for regular users)
  const candidateLimit = canViewAllUsers ? 100 : 1;
  
  const allUsers = await prisma.user.findMany({
    where,
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
    take: candidateLimit,
  });

  // Apply fuzzy search on name and email fields
  // Give higher weight to name matches
  const fuzzyResults = fuzzySearch(
    allUsers,
    searchTerm,
    {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "email", weight: 0.3 },
      ],
      threshold: 0.4, // Allow for some typos/mismatches
      minMatchCharLength: 2,
    }
  );

  // Rank and limit results (top 20)
  const rankedUsers = rankAndLimit(fuzzyResults, 20);

  return rankedUsers.map((u) => {
    // Regular users should link to their profile page, others to user detail page
    const url = !canViewAllUsers && u.id === user.id 
      ? "/dashboard/profile" 
      : `/dashboard/users/${u.id}`;
    
    return {
      type: "user" as const,
      id: u.id,
      title: formatUserName(u),
      description: u.email !== formatUserName(u) ? u.email : undefined,
      url,
      metadata: {
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdTicketsCount: u._count.createdTickets,
        assignedTicketsCount: u._count.assignedTickets,
        createdAt: u.createdAt,
      },
    };
  });
}

/**
 * Search tickets with filters and fuzzy matching
 */
async function searchTicketsWithFilters(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  filters: SearchFilters,
  userPermissions: Set<string>
): Promise<SearchResult[]> {
  const where: any = {};

  // Apply filters (exact matches)
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

  // Check if user has any dynamic ticket view permissions
  const { parseTicketPermissionKey } = await import("@/lib/utils/permissions");
  let hasDynamicViewPermissions = false;
  const dynamicTicketIds: string[] = [];
  for (const permissionKey of userPermissions) {
    const parsed = parseTicketPermissionKey(permissionKey);
    if (parsed && parsed.action === "view") {
      hasDynamicViewPermissions = true;
      dynamicTicketIds.push(parsed.ticketId);
    }
  }
  
  // Apply permission-based filtering
  const canViewAllTickets = userPermissions.has("tickets.view_all") || userPermissions.has("admin.tickets.manage");
  const canViewTickets = userPermissions.has("tickets.view") || canViewAllTickets || hasDynamicViewPermissions;

  if (!canViewTickets) {
    // User has no permission to view tickets (neither general nor dynamic)
    return [];
  }
  for (const permissionKey of userPermissions) {
    const parsed = parseTicketPermissionKey(permissionKey);
    if (parsed && parsed.action === "view") {
      dynamicTicketIds.push(parsed.ticketId);
    }
  }

  if (!canViewAllTickets) {
    // User can only view specific tickets
    const permissionFilters: any[] = [];
    
    // Add tickets with dynamic permissions
    if (dynamicTicketIds.length > 0) {
      permissionFilters.push({ id: { in: dynamicTicketIds } });
    }
    
    if (user.role === "AGENT") {
      // Agents can see tickets assigned to them or their groups
      const memberships = await prisma.groupMembership.findMany({
        where: { userId: user.id },
        select: { groupId: true },
      });
      const agentGroupIds = memberships.map((m) => m.groupId);

      // Agents can only see:
      // 1. Tickets assigned to them directly (assignedToId === user.id)
      // 2. Tickets assigned to their groups (assignedToGroupId IN agentGroupIds)
      // They should NOT see tickets with no group assignment unless assigned to them
      permissionFilters.push(
        { assignedToId: user.id },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : [])
      );
    } else if (user.role === "USER") {
      // Regular users can see tickets they created
      permissionFilters.push({ createdById: user.id });
    }

    // If we have permission filters, combine them with OR
    if (permissionFilters.length > 0) {
      const permissionFilter = {
        OR: permissionFilters,
      };

      where.AND = where.AND || [];
      where.AND.push(permissionFilter);
    }
  }
  // ADMIN/MODERATOR with view_all permission can see all tickets (no filter)

  // Determine sort order and limit
  const sortBy = filters.sortBy || "updatedAt";
  const sortOrder = filters.sortOrder || "desc";
  const limit = filters.limit || 100;

  // Fetch more candidates for fuzzy search (3x the limit, or at least 50)
  const candidateLimit = Math.max(limit * 3, 50);

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      archivedAt: true,
      status: true,
      priority: true,
      type: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedToGroupId: true,
      assignedToGroup: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      comments: {
        where: user.role === "USER"
          ? { isAgentOnly: false }
          : undefined,
        select: {
          id: true,
          content: true,
          createdAt: true,
          isAgentOnly: true,
          userId: true,
          authorName: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50, // Get all comments for fuzzy search
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
    take: candidateLimit,
  });

  // If no search term, return all tickets matching filters
  if (!searchTerm || searchTerm.trim().length === 0) {
    return tickets.slice(0, limit).map((ticket) => ({
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
        createdBy: formatUserName(ticket.createdBy, ticket.createdByName),
        assignedTo: ticket.assignedTo ? formatUserName(ticket.assignedTo) : undefined,
        assignedToGroup: ticket.assignedToGroup?.name,
        commentCount: ticket._count.comments,
        archivedAt: ticket.archivedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    }));
  }

  // Collect all comments with their ticket info for independent search
  // Flatten structure for Fuse.js compatibility
  const allCommentsWithTickets: Array<{
    id: string;
    content: string;
    createdAt: Date;
    isAgentOnly: boolean;
    ticketId: string;
    ticket: typeof tickets[0];
  }> = [];
  
  tickets.forEach((ticket) => {
    ticket.comments.forEach((comment) => {
      allCommentsWithTickets.push({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        isAgentOnly: comment.isAgentOnly,
        ticketId: ticket.id,
        ticket,
      });
    });
  });

  // Search comments independently with fuzzy matching
  const commentFuzzyResults = fuzzySearch(
    allCommentsWithTickets,
    searchTerm,
    {
      keys: [{ name: "content", weight: 1 }],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  // Get tickets that matched via comments (even if they didn't match other fields)
  const ticketsMatchedViaComments = new Set<string>();
  const topMatchingComments = rankAndLimit(commentFuzzyResults, limit * 2);
  topMatchingComments.forEach((item) => {
    ticketsMatchedViaComments.add(item.ticketId);
  });

  // Prepare tickets for fuzzy search on ticket fields
  // Include tags in the searchable text for fuzzy matching
  const ticketsForFuzzy = tickets.map((ticket) => ({
    ...ticket,
    searchableText: [
      ticket.title,
      ticket.description || "",
      ticket.ticketNumber,
      ...ticket.tags, // Include tags as separate items for better matching
    ].join(" "),
    tagsString: ticket.tags.join(" "), // Also keep tags as a separate field
  }));

  // Apply fuzzy search on ticket fields (title, description, ticketNumber, tags)
  const ticketFuzzyResults = fuzzySearch(
    ticketsForFuzzy,
    searchTerm,
    {
      keys: [
        { name: "title", weight: 0.4 },
        { name: "description", weight: 0.3 },
        { name: "ticketNumber", weight: 0.2 },
        { name: "tagsString", weight: 0.1 }, // Search tags with fuzzy matching
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  // Combine tickets that matched via fields OR via comments
  const matchedTicketIds = new Set<string>();
  
  // Add tickets that matched via fields
  ticketFuzzyResults.forEach((result) => {
    if (result.score !== undefined && result.score < 0.5) {
      matchedTicketIds.add(result.item.id);
    }
  });
  
  // Add tickets that matched via comments
  ticketsMatchedViaComments.forEach((ticketId) => {
    matchedTicketIds.add(ticketId);
  });

  // Get all matched tickets with their data
  const matchedTicketsMap = new Map(
    tickets.map((t) => [t.id, t])
  );

  // Create a combined list of tickets with their match scores
  const combinedResults: Array<{
    ticket: typeof tickets[0];
    score: number;
    matchedViaComments: boolean;
  }> = [];

  matchedTicketIds.forEach((ticketId) => {
    const ticket = matchedTicketsMap.get(ticketId);
    if (!ticket) return;

    // Find the best score from ticket field matching
    const ticketMatch = ticketFuzzyResults.find((r) => r.item.id === ticketId);
    const ticketScore = ticketMatch?.score ?? 1;

    // Find the best comment match score for this ticket
    const commentMatches = commentFuzzyResults.filter((r) => r.item.ticketId === ticketId);
    const bestCommentScore = commentMatches.length > 0
      ? Math.min(...commentMatches.map((r) => r.score ?? 1))
      : 1;

    // Use the better score (lower is better)
    const bestScore = Math.min(ticketScore, bestCommentScore);
    const matchedViaComments = ticketsMatchedViaComments.has(ticketId) && ticketScore >= 0.5;

    combinedResults.push({
      ticket,
      score: bestScore,
      matchedViaComments,
    });
  });

  // Sort by score and limit
  combinedResults.sort((a, b) => a.score - b.score);
  const topTickets = combinedResults.slice(0, limit).map((r) => r.ticket);

  const results: SearchResult[] = [];
  const processedTicketIds = new Set<string>();

  topTickets.forEach((ticket) => {
    processedTicketIds.add(ticket.id);
    
    // Check if ticket matched via non-comment fields
    const ticketMatch = ticketFuzzyResults.find((r) => r.item.id === ticket.id);
    const matchedViaOtherFields = ticketMatch !== undefined && 
      ticketMatch.score !== undefined && 
      ticketMatch.score < 0.5;

    // Get matching comments for this ticket
    const ticketCommentMatches = commentFuzzyResults
      .filter((r) => r.item.ticketId === ticket.id)
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 5);

    const matchingComments = ticketCommentMatches.map((r) => ({
      id: r.item.id,
      content: r.item.content,
      createdAt: r.item.createdAt,
      isAgentOnly: r.item.isAgentOnly,
    }));

    // Always add ticket if it matched via other fields OR if it has matching comments
    if (matchedViaOtherFields || matchingComments.length > 0) {
      results.push({
        type: "ticket" as const,
        id: ticket.id,
        title: ticket.title,
        description: matchedViaOtherFields ? ticket.description || undefined : undefined,
        url: `/dashboard/tickets/${ticket.id}`,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          priority: ticket.priority,
          type: ticket.type,
          createdBy: formatUserName(ticket.createdBy, ticket.createdByName),
          assignedTo: ticket.assignedTo ? formatUserName(ticket.assignedTo) : undefined,
          assignedToGroup: ticket.assignedToGroup?.name,
          commentCount: ticket._count.comments,
          archivedAt: ticket.archivedAt,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
        },
      });

      // Add each matching comment as a separate entry
      matchingComments.forEach((comment) => {
        results.push({
          type: "comment" as const,
          id: comment.id,
          title: comment.content,
          description: undefined,
          url: `/dashboard/tickets/${ticket.id}`,
          parentTicketId: ticket.id,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            ticketTitle: ticket.title,
            commentId: comment.id,
            createdAt: comment.createdAt,
            archivedAt: ticket.archivedAt,
          },
        });
      });
    }
  });

  // Also include top comments from tickets that weren't in the top tickets list
  // but had highly relevant comments
  const topComments = rankAndLimit(commentFuzzyResults, limit);
  topComments.forEach((item) => {
    if (!processedTicketIds.has(item.ticketId)) {
      const ticket = item.ticket;
      // Add the ticket if it's not already included
      if (!matchedTicketIds.has(item.ticketId)) {
        results.push({
          type: "ticket" as const,
          id: ticket.id,
          title: ticket.title,
          description: undefined,
          url: `/dashboard/tickets/${ticket.id}`,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            priority: ticket.priority,
            type: ticket.type,
            createdBy: formatUserName(ticket.createdBy, ticket.createdByName),
            assignedTo: ticket.assignedTo ? formatUserName(ticket.assignedTo) : undefined,
            assignedToGroup: ticket.assignedToGroup?.name,
            commentCount: ticket._count.comments,
            archivedAt: ticket.archivedAt,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
          },
        });
        processedTicketIds.add(item.ticketId);
      }

      // Add the comment
      results.push({
        type: "comment" as const,
        id: item.id,
        title: item.content,
        description: undefined,
        url: `/dashboard/tickets/${ticket.id}`,
        parentTicketId: ticket.id,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          ticketTitle: ticket.title,
          commentId: item.id,
          createdAt: item.createdAt,
          archivedAt: ticket.archivedAt,
        },
      });
    }
  });
  
  return results;
}

/**
 * Search time entries by name, description, tags, and location with fuzzy matching
 */
async function searchTimeEntries(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>
): Promise<SearchResult[]> {
  const where: any = {};

  // Check permissions
  const canViewAllTimeEntries = userPermissions.has("time_tracking.view_all");
  const canViewTimeEntries = userPermissions.has("time_tracking.view") || canViewAllTimeEntries;

  if (!canViewTimeEntries) {
    // User has no permission to view time entries
    return [];
  }

  if (!canViewAllTimeEntries) {
    // User can only see their own time entries
    where.userId = user.id;
  }
  // Users with view_all permission can see all time entries (no filter)

  // Fetch more candidates for fuzzy search (3x the limit, or at least 50)
  const candidateLimit = Math.max(limit * 3, 50);

  const timeEntries = await prisma.timeEntry.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      status: true,
      tags: true,
      location: true,
      startedAt: true,
      stoppedAt: true,
      completedAt: true,
      totalDuration: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      ticketId: true,
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  // If no search term, return all time entries
  if (!searchTerm || searchTerm.trim().length === 0) {
    return timeEntries.slice(0, limit).map((entry) => ({
      type: "timeentry" as const,
      id: entry.id,
      title: entry.name,
      description: entry.description || undefined,
      url: `/dashboard/time-tracking/${entry.id}`,
      metadata: {
        timerNumber: formatTimerNumber(entry.name, entry.id), // Timer number in TMR-000000 format (6 digits)
        status: entry.status,
        tags: entry.tags,
        location: entry.location,
        totalDuration: entry.totalDuration,
        startedAt: entry.startedAt,
        stoppedAt: entry.stoppedAt,
        completedAt: entry.completedAt,
        user: formatUserName(entry.user),
        ticketNumber: entry.ticket?.ticketNumber,
        ticketTitle: entry.ticket?.title,
        archivedAt: entry.archivedAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    }));
  }

  // Prepare time entries for fuzzy search
  const entriesForFuzzy = timeEntries.map((entry) => ({
    ...entry,
    searchableText: [
      entry.name,
      entry.description || "",
      entry.location || "",
      ...entry.tags,
    ].join(" "),
    tagsString: entry.tags.join(" "),
  }));

  // Apply fuzzy search on time entry fields
  const fuzzyResults = fuzzySearch(
    entriesForFuzzy,
    searchTerm,
    {
      keys: [
        { name: "name", weight: 0.5 },
        { name: "description", weight: 0.3 },
        { name: "location", weight: 0.1 },
        { name: "tagsString", weight: 0.1 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  // Rank and limit results
  const rankedEntries = rankAndLimit(fuzzyResults, limit);

  return rankedEntries.map((entry) => ({
    type: "timeentry" as const,
    id: entry.id,
    title: entry.name,
    description: entry.description || undefined,
    url: `/dashboard/time-tracking/${entry.id}`,
    metadata: {
      timerNumber: formatTimerNumber(entry.name, entry.id), // Timer number in TMR-000000 format (6 digits)
      status: entry.status,
      tags: entry.tags,
      location: entry.location,
      totalDuration: entry.totalDuration,
      startedAt: entry.startedAt,
      stoppedAt: entry.stoppedAt,
      completedAt: entry.completedAt,
      user: formatUserName(entry.user),
      ticketNumber: entry.ticket?.ticketNumber,
      ticketTitle: entry.ticket?.title,
      archivedAt: entry.archivedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  }));
}

/**
 * Search todos (including subtodos) by title and description with fuzzy matching.
 * Visibility rules:
 * - Admins/Moderators: all todos
 * - Agents: todos assigned to them, or todos linked to tickets they have access to
 * - Regular users: todos assigned to them
 */
async function searchTasks(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>
): Promise<SearchResult[]> {
  const where: any = {};

  const isAdminOrModerator = user.role === "ADMIN" || user.role === "MODERATOR";

  if (!isAdminOrModerator && user.role !== "AGENT") {
    // Regular users can only see todos assigned to them
    where.assignedToId = user.id;
  } else if (user.role === "AGENT") {
    // Agents: todos assigned to them OR todos linked to tickets they have access to
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const agentGroupIds = memberships.map((m) => m.groupId);

    const accessibleTickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { createdById: user.id },
          { assignedToId: user.id },
          ...(agentGroupIds.length > 0
            ? [{ assignedToGroupId: { in: agentGroupIds } }]
            : []),
        ],
      },
      select: { id: true },
    });

    const accessibleTicketIds = accessibleTickets.map((t) => t.id);

    where.OR = [
      { assignedToId: user.id },
      ...(accessibleTicketIds.length > 0
        ? [{ ticketId: { in: accessibleTicketIds } }]
        : []),
    ];
  }
  // Admins/Moderators: no extra filter, see all todos

  const candidateLimit = Math.max(limit * 3, 50);

  const todos = await prisma.todo.findMany({
    where,
    select: {
      id: true,
      todoNumber: true,
      title: true,
      description: true,
      descriptionPlain: true,
      archivedAt: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      parentTodoId: true,
      parentTodo: {
        select: {
          id: true,
          title: true,
        },
      },
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      ticketId: true,
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  // If no search term, return recent todos (top N)
  if (!searchTerm || searchTerm.trim().length === 0) {
    return todos.slice(0, limit).map((todo) => ({
      type: "task" as const,
      id: todo.id,
      title: todo.title,
      description: todo.descriptionPlain || todo.description || undefined,
      url: `/dashboard/todos/${todo.id}`,
      metadata: {
        todoNumber: todo.todoNumber,
        status: todo.status,
        priority: todo.priority,
        parentTodoTitle: todo.parentTodo?.title,
        ticketNumber: todo.ticket?.ticketNumber,
        ticketTitle: todo.ticket?.title,
        assignedTo: todo.assignedTo ? formatUserName(todo.assignedTo) : undefined,
        archivedAt: todo.archivedAt,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      },
    }));
  }

  const trimmed = searchTerm.trim();

  // Prepare todos for fuzzy search on title and description
  const todosForFuzzy = todos.map((todo) => ({
    ...todo,
    searchableText: [
      todo.title,
      todo.description || "",
      todo.descriptionPlain || "",
      todo.todoNumber || "",
      todo.ticket?.ticketNumber || "",
      todo.ticket?.title || "",
      todo.parentTodo?.title || "",
    ].join(" "),
  }));

  const todoFuzzyResults = fuzzySearch(
    todosForFuzzy,
    trimmed,
    {
      keys: [
        { name: "title", weight: 0.5 },
        { name: "description", weight: 0.25 },
        { name: "descriptionPlain", weight: 0.25 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  const topTodos = rankAndLimit(todoFuzzyResults, limit);

  return topTodos.map((todo) => ({
    type: "task" as const,
    id: todo.id,
    title: todo.title,
    description: todo.descriptionPlain || todo.description || undefined,
    url: `/dashboard/todos/${todo.id}`,
    metadata: {
      todoNumber: todo.todoNumber,
      status: todo.status,
      priority: todo.priority,
      parentTodoTitle: todo.parentTodo?.title,
      ticketNumber: todo.ticket?.ticketNumber,
      ticketTitle: todo.ticket?.title,
      assignedTo: todo.assignedTo ? formatUserName(todo.assignedTo) : undefined,
      archivedAt: todo.archivedAt,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    },
  }));
}

/**
 * Search settings that are available to the current user
 *
 * This is a virtual search over known settings sections and options.
 * Results are filtered based on the user's role so that only accessible
 * settings are returned.
 */
async function searchSettings(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number
): Promise<SearchResult[]> {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  const normalizedTerm = searchTerm.trim();

  type AppSetting = {
    id: string;
    title: string;
    description: string;
    url: string;
    category: "account" | "preferences" | "privacy" | "security" | "system";
    roles?: Array<"USER" | "AGENT" | "ADMIN" | "MODERATOR">;
    keywords: string[];
  };

  const baseSettings: AppSetting[] = [
    {
      id: "account-email",
      title: "Change Email Address",
      description: "Update the email address associated with your account.",
      url: "/dashboard/settings",
      category: "account",
      keywords: ["email", "address", "login", "account", "contact"],
    },
    {
      id: "account-password",
      title: "Change Password",
      description: "Update your account password and improve your security.",
      url: "/dashboard/settings",
      category: "account",
      keywords: ["password", "security", "login", "credentials"],
    },
    {
      id: "preferences-theme",
      title: "Appearance & Theme",
      description: "Switch between light, dark, or system theme.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["theme", "dark mode", "light mode", "appearance", "color"],
    },
    {
      id: "preferences-language",
      title: "Language",
      description: "Change the language used in the application interface.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["language", "locale", "translation"],
    },
    {
      id: "preferences-timezone",
      title: "Time Zone",
      description: "Set your preferred time zone for displaying dates and times.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["timezone", "time zone", "time", "clock", "dates"],
    },
    {
      id: "preferences-notifications-email",
      title: "Email Notifications",
      description: "Control email notifications about important account activity.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["notifications", "email", "alerts", "messages"],
    },
    {
      id: "preferences-notifications-push",
      title: "Push Notifications",
      description: "Enable or disable browser push notifications.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["notifications", "push", "browser", "alerts"],
    },
    {
      id: "preferences-notifications-marketing",
      title: "Marketing Emails",
      description: "Manage whether you receive product updates and marketing emails.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["marketing", "newsletter", "emails", "announcements"],
    },
    {
      id: "preferences-timer-widget",
      title: "Timer Widget Display",
      description: "Choose whether the time tracking widget appears as a dialog or floating widget.",
      url: "/dashboard/settings",
      category: "preferences",
      keywords: ["time tracking", "timer", "widget", "floating", "dialog"],
    },
    {
      id: "privacy-profile-visibility",
      title: "Profile Visibility",
      description: "Control who can see your profile in the workspace.",
      url: "/dashboard/settings",
      category: "privacy",
      keywords: ["privacy", "profile", "visibility", "public", "private"],
    },
    {
      id: "privacy-show-email",
      title: "Show Email Address",
      description: "Allow or hide your email address on your profile.",
      url: "/dashboard/settings",
      category: "privacy",
      keywords: ["privacy", "email", "profile", "contact"],
    },
    {
      id: "privacy-last-seen",
      title: "Show Last Seen",
      description: "Control whether other users can see when you were last active.",
      url: "/dashboard/settings",
      category: "privacy",
      keywords: ["last seen", "online status", "activity", "privacy"],
    },
    {
      id: "security-two-factor",
      title: "Two-Factor Authentication",
      description: "Add an extra layer of security to your account with two-factor authentication.",
      url: "/dashboard/settings",
      category: "security",
      keywords: ["2fa", "two factor", "authentication", "security", "login"],
    },
    {
      id: "system-settings",
      title: "System Settings",
      description: "View system information, health checks, and database statistics.",
      url: "/dashboard/admin/settings",
      category: "system",
      roles: ["ADMIN"],
      keywords: ["system", "admin", "settings", "health", "database", "metrics"],
    },
    {
      id: "system-purge-deleted-accounts",
      title: "Purge Deleted Accounts",
      description: "Permanently remove user accounts that have been scheduled for deletion.",
      url: "/dashboard/admin/settings",
      category: "system",
      roles: ["ADMIN"],
      keywords: ["purge", "deleted accounts", "cleanup", "admin"],
    },
  ];

  // Filter settings based on user role
  const availableSettings = baseSettings.filter((setting) => {
    if (!setting.roles || setting.roles.length === 0) {
      return true;
    }
    return setting.roles.includes(user.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR");
  });

  if (availableSettings.length === 0) {
    return [];
  }

  const searchableSettings = availableSettings.map((setting) => ({
    ...setting,
    searchableText: [
      setting.title,
      setting.description,
      setting.keywords.join(" "),
      setting.category,
    ].join(" "),
  }));

  // First, check for word matches (case-insensitive) in title, description, or keywords
  // This prevents substring matches like "test" matching "settings"
  const lowerTerm = normalizedTerm.toLowerCase();
  const termWords = lowerTerm.split(/\s+/).filter(Boolean);
  const exactMatches = searchableSettings.filter((setting) => {
    const titleLower = setting.title.toLowerCase();
    const descLower = setting.description.toLowerCase();
    const keywordsLower = setting.keywords.join(" ").toLowerCase();
    const allText = `${titleLower} ${descLower} ${keywordsLower}`;
    
    // Check if all search terms appear as whole words (word boundary match)
    return termWords.every((term) => {
      // Use word boundary regex to match whole words only
      const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return wordBoundaryRegex.test(allText);
    });
  });

  // If we have exact matches, use those; otherwise use fuzzy search with stricter threshold
  let rankedSettings: typeof searchableSettings;
  if (exactMatches.length > 0) {
    rankedSettings = exactMatches.slice(0, limit);
  } else {
    // Use fuzzy search with stricter threshold for settings (0.3 instead of 0.4)
    const fuzzyResults = fuzzySearch(searchableSettings, normalizedTerm, {
      keys: [
        { name: "title", weight: 0.5 },
        { name: "description", weight: 0.3 },
        { name: "searchableText", weight: 0.2 },
      ],
      threshold: 0.3, // Stricter threshold for settings
      minMatchCharLength: 2,
    });

    // Filter out results with poor scores (score > 0.3 means not a good match)
    const goodMatches = fuzzyResults.filter((result) => (result.score ?? 1) <= 0.3);
    rankedSettings = rankAndLimit(goodMatches, limit);
  }

  return rankedSettings.map((setting) => ({
    type: "setting" as const,
    id: setting.id,
    title: setting.title,
    description: setting.description,
    url: setting.url,
    metadata: {
      category: setting.category,
    },
  }));
}

/**
 * Search tickets by title, description, ticketNumber, tags, and comments with fuzzy matching
 */
async function searchTickets(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>
): Promise<SearchResult[]> {
  const where: any = {};

  // Check if user has any dynamic ticket view permissions
  const { parseTicketPermissionKey } = await import("@/lib/utils/permissions");
  let hasDynamicViewPermissions = false;
  const dynamicTicketIds: string[] = [];
  for (const permissionKey of userPermissions) {
    const parsed = parseTicketPermissionKey(permissionKey);
    if (parsed && parsed.action === "view") {
      hasDynamicViewPermissions = true;
      dynamicTicketIds.push(parsed.ticketId);
    }
  }

  // Apply permission-based filtering
  const canViewAllTickets = userPermissions.has("tickets.view_all") || userPermissions.has("admin.tickets.manage");
  const canViewTickets = userPermissions.has("tickets.view") || canViewAllTickets || hasDynamicViewPermissions;

  if (!canViewTickets) {
    // User has no permission to view tickets (neither general nor dynamic)
    return [];
  }

  if (!canViewAllTickets) {
    // User can only view specific tickets
    const permissionFilters: any[] = [];
    
    // Add tickets with dynamic permissions
    if (dynamicTicketIds.length > 0) {
      permissionFilters.push({ id: { in: dynamicTicketIds } });
    }
    
    if (user.role === "AGENT") {
      // Agents can see tickets assigned to them or their groups
      const memberships = await prisma.groupMembership.findMany({
        where: { userId: user.id },
        select: { groupId: true },
      });
      const agentGroupIds = memberships.map((m) => m.groupId);

      // Agents can only see:
      // 1. Tickets assigned to them directly (assignedToId === user.id)
      // 2. Tickets assigned to their groups (assignedToGroupId IN agentGroupIds)
      // They should NOT see tickets with no group assignment unless assigned to them
      permissionFilters.push(
        { assignedToId: user.id },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : [])
      );
    } else if (user.role === "USER") {
      // Regular users can see tickets they created
      permissionFilters.push({ createdById: user.id });
    }

    // If we have permission filters, combine them with OR
    if (permissionFilters.length > 0) {
      where.OR = permissionFilters;
    }
  }
  // ADMIN/MODERATOR with view_all permission can see all tickets (no filter)

  // Use PostgreSQL full-text search for initial filtering if search term is provided
  // This is much faster than loading all tickets and filtering in memory
  let ticketIdsFromTextSearch: string[] = [];
  
  if (searchTerm && searchTerm.trim().length >= 2) {
    // Build permission filter conditions
    const permissionConditions: string[] = [];
    if (!canViewAllTickets) {
      if (dynamicTicketIds.length > 0) {
        const ids = dynamicTicketIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        permissionConditions.push(`id = ANY(ARRAY[${ids}]::text[])`);
      }
      if (user.role === "AGENT") {
        const memberships = await prisma.groupMembership.findMany({
          where: { userId: user.id },
          select: { groupId: true },
        });
        const agentGroupIds = memberships.map((m) => m.groupId);
        permissionConditions.push(`"assignedToId" = '${user.id.replace(/'/g, "''")}'`);
        if (agentGroupIds.length > 0) {
          const groupIds = agentGroupIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
          permissionConditions.push(`"assignedToGroupId" = ANY(ARRAY[${groupIds}]::text[])`);
        }
      } else if (user.role === "USER") {
        permissionConditions.push(`"createdById" = '${user.id.replace(/'/g, "''")}'`);
      }
    }
    
    const permissionFilter = permissionConditions.length > 0 
      ? `AND (${permissionConditions.join(' OR ')})`
      : '';
    
    const sanitizedSearchTerm = searchTerm.trim().replace(/'/g, "''"); // Escape single quotes for SQL
    const searchLimit = Math.min(limit * 5, 500);
    
    // Build permission filter SQL fragment
    const permissionFilterSql = permissionConditions.length > 0 
      ? `AND (${permissionConditions.join(' OR ')})`
      : '';
    
    // Use full-text search to get matching ticket IDs (uses GIN index)
    const textSearchQuery = Prisma.sql`
      SELECT id
      FROM tickets
      WHERE to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE("descriptionPlain", '') || ' ' || 
        COALESCE("ticketNumber", '')
      ) @@ plainto_tsquery('english', ${sanitizedSearchTerm})
      ${permissionFilterSql ? Prisma.raw(permissionFilterSql) : Prisma.sql``}
      ORDER BY ts_rank(
        to_tsvector('english', 
          COALESCE(title, '') || ' ' || 
          COALESCE("descriptionPlain", '') || ' ' || 
          COALESCE("ticketNumber", '')
        ),
        plainto_tsquery('english', ${sanitizedSearchTerm})
      ) DESC
      LIMIT ${searchLimit}
    `;
    
    const textSearchResults = await prisma.$queryRaw<Array<{ id: string }>>(textSearchQuery);
    
    ticketIdsFromTextSearch = textSearchResults.map(r => r.id);
    
    // If no results from ticket text search, check comments
    if (ticketIdsFromTextSearch.length === 0) {
      const commentLimit = limit * 2;
      const commentSearchQuery = user.role === "USER" 
        ? Prisma.sql`
          SELECT DISTINCT c."ticketId"
          FROM ticket_comments c
          JOIN tickets t ON t.id = c."ticketId"
          WHERE to_tsvector('english', COALESCE(c."contentPlain", c.content, '')) @@ plainto_tsquery('english', ${sanitizedSearchTerm})
          AND c."isAgentOnly" = false
          LIMIT ${commentLimit}
        `
        : Prisma.sql`
          SELECT DISTINCT c."ticketId"
          FROM ticket_comments c
          JOIN tickets t ON t.id = c."ticketId"
          WHERE to_tsvector('english', COALESCE(c."contentPlain", c.content, '')) @@ plainto_tsquery('english', ${sanitizedSearchTerm})
          LIMIT ${commentLimit}
        `;
      
      const commentSearchResults = await prisma.$queryRaw<Array<{ ticketId: string }>>(commentSearchQuery);
      
      ticketIdsFromTextSearch = commentSearchResults.map(r => r.ticketId);
      
      if (ticketIdsFromTextSearch.length === 0) {
        return []; // No matches found
      }
    }
    
    // Add text search filter to where clause
    where.id = { in: ticketIdsFromTextSearch };
  }
  
  // Reduced candidate limit - we're already filtering at database level
  const candidateLimit = searchTerm ? Math.min(limit * 2, 200) : Math.min(limit * 2, 100);
  
  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      descriptionPlain: true,
      archivedAt: true,
      status: true,
      priority: true,
      type: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedToGroupId: true,
      assignedToGroup: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      // Only load comments if we're searching and we need them for fuzzy matching
      // Comments matching the search term are loaded separately via full-text search
      comments: undefined, // Load comments separately only when needed
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  // Load comments separately only if we have a search term
  let ticketsMatchedViaComments = new Set<string>();
  let commentFuzzyResults: Array<{ item: { id: string; content: string; createdAt: Date; isAgentOnly: boolean; ticketId: string; ticket: typeof tickets[0] }; score?: number }> = [];
  
  if (searchTerm && searchTerm.trim().length >= 2 && tickets.length > 0) {
    // Get ticket IDs we already have
    const ticketIds = tickets.map(t => t.id);
    
    // Load matching comments using full-text search (much faster than loading all comments)
    const sanitizedSearchTerm = searchTerm.trim().replace(/'/g, "''"); // Escape single quotes for SQL
    const commentLimit = limit * 3;
    const commentSearchQuery = user.role === "USER"
      ? Prisma.sql`
        SELECT 
          c.id,
          COALESCE(c."contentPlain", c.content, '') as content,
          c."createdAt",
          c."isAgentOnly",
          c."ticketId"
        FROM ticket_comments c
        WHERE to_tsvector('english', COALESCE(c."contentPlain", c.content, '')) @@ plainto_tsquery('english', ${sanitizedSearchTerm})
        AND c."isAgentOnly" = false
        AND c."ticketId" = ANY(${ticketIds}::text[])
        ORDER BY ts_rank(
          to_tsvector('english', COALESCE(c."contentPlain", c.content, '')),
          plainto_tsquery('english', ${sanitizedSearchTerm})
        ) DESC
        LIMIT ${commentLimit}
      `
      : Prisma.sql`
        SELECT 
          c.id,
          COALESCE(c."contentPlain", c.content, '') as content,
          c."createdAt",
          c."isAgentOnly",
          c."ticketId"
        FROM ticket_comments c
        WHERE to_tsvector('english', COALESCE(c."contentPlain", c.content, '')) @@ plainto_tsquery('english', ${sanitizedSearchTerm})
        AND c."ticketId" = ANY(${ticketIds}::text[])
        ORDER BY ts_rank(
          to_tsvector('english', COALESCE(c."contentPlain", c.content, '')),
          plainto_tsquery('english', ${sanitizedSearchTerm})
        ) DESC
        LIMIT ${commentLimit}
      `;
    
    const matchingComments = await prisma.$queryRaw<Array<{
      id: string;
      content: string;
      createdAt: Date;
      isAgentOnly: boolean;
      ticketId: string;
    }>>(commentSearchQuery);
    
    // Map comments to tickets we already loaded
    const ticketMap = new Map(tickets.map(t => [t.id, t]));
    const allCommentsWithTickets = matchingComments
      .map(comment => {
        const ticket = ticketMap.get(comment.ticketId);
        if (!ticket) return null;
        
        return {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          isAgentOnly: comment.isAgentOnly,
          ticketId: comment.ticketId,
          ticket,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    
    // Apply fuzzy search for final ranking (database already filtered, just rank)
    commentFuzzyResults = fuzzySearch(
      allCommentsWithTickets,
      searchTerm,
      {
        keys: [{ name: "content", weight: 1 }],
        threshold: 0.4,
        minMatchCharLength: 2,
      }
    );
    
    // Get tickets that matched via comments
    const topMatchingComments = rankAndLimit(commentFuzzyResults, limit * 2);
    topMatchingComments.forEach((item) => {
      ticketsMatchedViaComments.add(item.ticketId);
    });
  }

  // Prepare tickets for fuzzy search on ticket fields
  // Since we already filtered at database level, this is mainly for ranking
  const ticketsForFuzzy = tickets.map((ticket) => ({
    ...ticket,
    searchableText: [
      ticket.title,
      ticket.description || ticket.descriptionPlain || "",
      ticket.ticketNumber,
      ...ticket.tags,
    ].join(" "),
    tagsString: ticket.tags.join(" "),
  }));

  // Apply fuzzy search on ticket fields for ranking (database already filtered)
  const ticketFuzzyResults = fuzzySearch(
    ticketsForFuzzy,
    searchTerm || "",
    {
      keys: [
        { name: "title", weight: 0.4 },
        { name: "description", weight: 0.3 },
        { name: "descriptionPlain", weight: 0.3 },
        { name: "ticketNumber", weight: 0.2 },
        { name: "tagsString", weight: 0.1 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  // Combine tickets that matched via fields OR via comments
  const matchedTicketIds = new Set<string>();
  
  // Add tickets that matched via fields
  ticketFuzzyResults.forEach((result) => {
    if (result.score !== undefined && result.score < 0.5) {
      matchedTicketIds.add(result.item.id);
    }
  });
  
  // Add tickets that matched via comments
  ticketsMatchedViaComments.forEach((ticketId) => {
    matchedTicketIds.add(ticketId);
  });

  // Get all matched tickets with their data
  const matchedTicketsMap = new Map(
    tickets.map((t) => [t.id, t])
  );

  // Create a combined list of tickets with their match scores
  const combinedResults: Array<{
    ticket: typeof tickets[0];
    score: number;
    matchedViaComments: boolean;
  }> = [];

  matchedTicketIds.forEach((ticketId) => {
    const ticket = matchedTicketsMap.get(ticketId);
    if (!ticket) return;

    // Find the best score from ticket field matching
    const ticketMatch = ticketFuzzyResults.find((r) => r.item.id === ticketId);
    const ticketScore = ticketMatch?.score ?? 1;

    // Find the best comment match score for this ticket
    const commentMatches = commentFuzzyResults.filter((r) => r.item.ticketId === ticketId);
    const bestCommentScore = commentMatches.length > 0
      ? Math.min(...commentMatches.map((r) => r.score ?? 1))
      : 1;

    // Use the better score (lower is better)
    const bestScore = Math.min(ticketScore, bestCommentScore);
    const matchedViaComments = ticketsMatchedViaComments.has(ticketId) && ticketScore >= 0.5;

    combinedResults.push({
      ticket,
      score: bestScore,
      matchedViaComments,
    });
  });

  // Sort by score and limit
  combinedResults.sort((a, b) => a.score - b.score);
  const topTickets = combinedResults.slice(0, limit).map((r) => r.ticket);

  const results: SearchResult[] = [];
  const processedTicketIds = new Set<string>();

  topTickets.forEach((ticket) => {
    processedTicketIds.add(ticket.id);
    
    // Check if ticket matched via non-comment fields
    const ticketMatch = ticketFuzzyResults.find((r) => r.item.id === ticket.id);
    const matchedViaOtherFields = ticketMatch !== undefined && 
      ticketMatch.score !== undefined && 
      ticketMatch.score < 0.5;

    // Get matching comments for this ticket
    const ticketCommentMatches = commentFuzzyResults
      .filter((r) => r.item.ticketId === ticket.id)
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 5);

    const matchingComments = ticketCommentMatches.map((r) => ({
      id: r.item.id,
      content: r.item.content,
      createdAt: r.item.createdAt,
      isAgentOnly: r.item.isAgentOnly,
    }));

    // Always add ticket if it matched via other fields OR if it has matching comments
    if (matchedViaOtherFields || matchingComments.length > 0) {
      results.push({
        type: "ticket" as const,
        id: ticket.id,
        title: ticket.title,
        description: matchedViaOtherFields ? ticket.description || undefined : undefined,
        url: `/dashboard/tickets/${ticket.id}`,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          priority: ticket.priority,
          type: ticket.type,
          createdBy: formatUserName(ticket.createdBy, ticket.createdByName),
          assignedTo: ticket.assignedTo ? formatUserName(ticket.assignedTo) : undefined,
          commentCount: ticket._count.comments,
          archivedAt: ticket.archivedAt,
        },
      });

      // Add each matching comment as a separate entry
      matchingComments.forEach((comment) => {
        results.push({
          type: "comment" as const,
          id: comment.id,
          title: comment.content,
          description: undefined,
          url: `/dashboard/tickets/${ticket.id}`,
          parentTicketId: ticket.id,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            ticketTitle: ticket.title,
            commentId: comment.id,
            createdAt: comment.createdAt,
            archivedAt: ticket.archivedAt,
          },
        });
      });
    }
  });

  // Also include top comments from tickets that weren't in the top tickets list
  // but had highly relevant comments
  const topComments = rankAndLimit(commentFuzzyResults, limit);
  topComments.forEach((item) => {
    if (!processedTicketIds.has(item.ticketId)) {
      const ticket = item.ticket;
      // Add the ticket if it's not already included
      if (!matchedTicketIds.has(item.ticketId)) {
        results.push({
          type: "ticket" as const,
          id: ticket.id,
          title: ticket.title,
          description: undefined,
          url: `/dashboard/tickets/${ticket.id}`,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            priority: ticket.priority,
            type: ticket.type,
            createdBy: formatUserName(ticket.createdBy, ticket.createdByName),
            assignedTo: ticket.assignedTo ? formatUserName(ticket.assignedTo) : undefined,
            commentCount: ticket._count.comments,
            archivedAt: ticket.archivedAt,
          },
        });
        processedTicketIds.add(item.ticketId);
      }

      // Add the comment
      results.push({
        type: "comment" as const,
        id: item.id,
        title: item.content,
        description: undefined,
        url: `/dashboard/tickets/${ticket.id}`,
        parentTicketId: ticket.id,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          ticketTitle: ticket.title,
          commentId: item.id,
          createdAt: item.createdAt,
          archivedAt: ticket.archivedAt,
        },
      });
    }
  });

  return results;
}
