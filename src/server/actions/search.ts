"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { fuzzySearch, rankAndLimit } from "@/lib/utils/fuzzy-search";

export type SearchResult = {
  type: "ticket" | "module" | "user" | "comment" | "timeentry" | "project";
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
 * Supports tickets, users, time entries, and projects
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
  // 30% users, 40% tickets, 15% time entries, 15% projects
  const userLimit = Math.max(1, Math.floor(limit * 0.3));
  const ticketLimit = Math.max(1, Math.floor(limit * 0.4));
  const timeEntryLimit = Math.max(1, Math.floor(limit * 0.15));
  const projectLimit = Math.max(1, Math.floor(limit * 0.15));

  // Search users if user is agent/admin/moderator
  if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
    const userResults = await searchUsers(searchTerm, user);
    totalCount += userResults.length;
    results.push(...userResults.slice(0, userLimit));
  }

  // Search tickets if module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  if (ticketsEnabled) {
    const ticketResults = await searchTickets(searchTerm, user, ticketLimit);
    totalCount += ticketResults.length;
    results.push(...ticketResults);
  }

  // Search time entries if module is enabled
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
  if (timeTrackingEnabled) {
    const timeEntryResults = await searchTimeEntries(searchTerm, user, timeEntryLimit);
    totalCount += timeEntryResults.length;
    results.push(...timeEntryResults);
  }

  // Search projects if module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (projectsEnabled) {
    const projectResults = await searchProjects(searchTerm, user, projectLimit);
    totalCount += projectResults.length;
    results.push(...projectResults);
  }

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

  // Search time entries if module is enabled
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
  if (timeTrackingEnabled) {
    const timeEntryResults = await searchTimeEntries(searchTerm, user, filters.limit || 100);
    results.push(...timeEntryResults);
  }

  // Search projects if module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (projectsEnabled) {
    const projectResults = await searchProjects(searchTerm, user, filters.limit || 100);
    results.push(...projectResults);
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
  user: Awaited<ReturnType<typeof requireAuth>>
): Promise<SearchResult[]> {
  // Only agents and admins can search for users
  if (user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    return [];
  }

  // Fetch more candidates for fuzzy search (100 users)
  // Use a broader query to get candidates for fuzzy matching
  const allUsers = await prisma.user.findMany({
    where: {
      status: {
        in: ["ACTIVE", "PENDING"],
      },
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
    take: 100, // Fetch more candidates for fuzzy search
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

  return rankedUsers.map((u) => ({
    type: "user" as const,
    id: u.id,
    title: formatUserName(u),
    description: u.email !== formatUserName(u) ? u.email : undefined,
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
 * Search tickets with filters and fuzzy matching
 */
async function searchTicketsWithFilters(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  filters: SearchFilters
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
    where.AND.push(groupFilter);
  } else if (user.role === "USER") {
    // Regular users can only see tickets they created
    where.createdById = user.id;
  }

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
  limit: number
): Promise<SearchResult[]> {
  const where: any = {
    userId: user.id, // Users can only see their own time entries
  };

  // For agents/admins/moderators, they can see all time entries
  if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
    delete where.userId;
  }

  // Fetch more candidates for fuzzy search (3x the limit, or at least 50)
  const candidateLimit = Math.max(limit * 3, 50);

  const timeEntries = await prisma.timeEntry.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
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
      projectId: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
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
        projectCode: entry.project?.code,
        projectName: entry.project?.name,
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
      projectCode: entry.project?.code,
      projectName: entry.project?.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
  }));
}

/**
 * Search projects by name, description, code, and client with fuzzy matching
 */
async function searchProjects(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number
): Promise<SearchResult[]> {
  // For regular users, they can only see projects they're members of
  // For agents/admins/moderators, they can see all projects
  let where: any = {};

  if (user.role === "USER") {
    // Get projects where user is a member
    const userProjects = await prisma.projectUser.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    const projectIds = userProjects.map((up) => up.projectId);
    
    if (projectIds.length === 0) {
      return [];
    }
    
    where.id = { in: projectIds };
  }
  // AGENT, ADMIN, MODERATOR can see all projects (no filter needed)

  // Fetch more candidates for fuzzy search (3x the limit, or at least 50)
  const candidateLimit = Math.max(limit * 3, 50);

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      startDate: true,
      endDate: true,
      client: true,
      color: true,
      icon: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          tickets: true,
          timeEntries: true,
          members: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  // If no search term, return all projects
  if (!searchTerm || searchTerm.trim().length === 0) {
    return projects.slice(0, limit).map((project) => ({
      type: "project" as const,
      id: project.id,
      title: project.name,
      description: project.description || undefined,
      url: `/dashboard/projects/${project.id}`,
      metadata: {
        code: project.code,
        status: project.status,
        priority: project.priority,
        client: project.client,
        startDate: project.startDate,
        endDate: project.endDate,
        createdBy: formatUserName(project.createdBy),
        ticketCount: project._count.tickets,
        timeEntryCount: project._count.timeEntries,
        memberCount: project._count.members,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    }));
  }

  // Prepare projects for fuzzy search
  const projectsForFuzzy = projects.map((project) => ({
    ...project,
    searchableText: [
      project.name,
      project.description || "",
      project.code,
      project.client || "",
    ].join(" "),
  }));

  // Apply fuzzy search on project fields
  const fuzzyResults = fuzzySearch(
    projectsForFuzzy,
    searchTerm,
    {
      keys: [
        { name: "name", weight: 0.4 },
        { name: "description", weight: 0.3 },
        { name: "code", weight: 0.2 },
        { name: "client", weight: 0.1 },
      ],
      threshold: 0.4,
      minMatchCharLength: 2,
    }
  );

  // Rank and limit results
  const rankedProjects = rankAndLimit(fuzzyResults, limit);

  return rankedProjects.map((project) => ({
    type: "project" as const,
    id: project.id,
    title: project.name,
    description: project.description || undefined,
    url: `/dashboard/projects/${project.id}`,
    metadata: {
      code: project.code,
      status: project.status,
      priority: project.priority,
      client: project.client,
      startDate: project.startDate,
      endDate: project.endDate,
      createdBy: formatUserName(project.createdBy),
      ticketCount: project._count.tickets,
      timeEntryCount: project._count.timeEntries,
      memberCount: project._count.members,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  }));
}

/**
 * Search tickets by title, description, ticketNumber, tags, and comments with fuzzy matching
 */
async function searchTickets(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number
): Promise<SearchResult[]> {
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
    where.OR = [
      { assignedToGroupId: null },
      ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : []),
    ];
  } else if (user.role === "USER") {
    // Regular users can only see tickets they created
    where.createdById = user.id;
  }
  // ADMIN and MODERATOR can see all tickets (no filter needed)

  // Fetch more candidates for fuzzy search (3x the limit, or at least 100 to ensure we get enough comments)
  const candidateLimit = Math.max(limit * 3, 100);
  
  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
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
        // Get all comments for fuzzy search, not just recent ones
        take: 50,
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
    take: candidateLimit,
  });

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
          commentCount: ticket._count.comments,
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
        },
      });
    }
  });

  return results;
}
