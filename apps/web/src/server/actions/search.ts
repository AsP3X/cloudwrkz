"use server";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";
import { requireAuth, type CurrentUser } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { canUserViewModule } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import {
  filterFuzzyBySubstringMatch,
  fuzzySearch,
  rankAndLimit,
  sortByScore,
  textContainsQuery,
} from "@/lib/utils/fuzzy-search";
import { getUserPermissions } from "@/lib/utils/permissions";
import { formatTimerNumber } from "@/lib/utils/time-tracking";
import {
  type EnhancedSearchParams,
  parseTimestampRange,
  mapEnhancedTypeToResultTypes,
  ENHANCED_SEARCH_FUZZY_PARAM_KEYS,
} from "@/lib/utils/enhanced-search";

export type SearchResult = {
  type: "ticket" | "module" | "user" | "comment" | "timeentry" | "setting" | "task" | "subtask" | "link";
  id: string;
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
  parentTicketId?: string; // For comment results, link to parent ticket
  /** What triggered the match (e.g. "Comment", "Email", "Tags"). Omit when match is already in title or description. */
  context?: string;
  /** Exact text that triggered the match; when set, UI highlights this in context instead of the search query. */
  contextHighlight?: string;
};

/**
 * Future: include background jobs in global fuzzy search only when the user has
 * `search.jobs.view` (see `SEARCH_JOBS_PERMISSION_KEY` in `@/lib/constants/permissions`).
 */

export type SearchResponse = {
  results: SearchResult[];
  total: number;
};

/** Used when merging and globally ranking results from multiple search functions. */
export type ScoredSearchResult = { result: SearchResult; score: number };

const GLOBAL_SEARCH_CAP_PER_TYPE = 500;

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
  /** When set, only run searches that produce these result types (e.g. ["link"] for type: "video"). */
  restrictResultTypes?: string[];
  /** When set with restrictResultTypes including "link", only return links with this linkType (e.g. "VIDEO"). */
  restrictLinkType?: string;
};

function truncateForContext(s: string, maxLen = 80): string {
  if (!s?.trim()) return "";
  const t = s.trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen) + "…";
}

function termInText(term: string, text: string | null | undefined): boolean {
  return !!text && text.toLowerCase().includes(term.toLowerCase());
}

/**
 * Extract a snippet and the matched text from a Fuse match (e.g. for metadataString).
 * For multi-term queries (e.g. "branch main"), finds the closest pair of ranges (one per term)
 * and builds the snippet around the span that contains both, so we show the correct context
 * (e.g. "branch":"main") instead of a stray occurrence (e.g. "main" in an array).
 * Fuse indices are [start, end] inclusive.
 */
function snippetFromFuseMatch(
  match: { value?: string; indices?: ReadonlyArray<[number, number]> },
  searchTerm: string,
  snippetPadding = 50,
  maxSnippetLen = 120
): { snippet: string; matchedText: string } {
  const value = match.value ?? "";
  const indices = match.indices ?? [];
  if (indices.length === 0) {
    const truncated = truncateForContext(value, maxSnippetLen);
    return { snippet: truncated, matchedText: "" };
  }
  const terms = searchTerm
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const ranges = indices.map(([s, e]) => ({ start: s, end: e, text: value.slice(s, e + 1) }));
  const rangeTextLower = (r: (typeof ranges)[0]) => r.text.toLowerCase().trim();

  const gap = (a: { start: number; end: number }, b: { start: number; end: number }) => {
    if (a.end < b.start) return b.start - a.end - 1;
    if (b.end < a.start) return a.start - b.end - 1;
    return 0;
  };

  if (terms.length >= 2) {
    const rangesByTerm = terms.map((term) =>
      ranges.filter((r) => rangeTextLower(r) === term || rangeTextLower(r).includes(term) || term.includes(rangeTextLower(r)))
    );
    if (!rangesByTerm.some((arr) => arr.length === 0)) {
      let bestPair: { r1: (typeof ranges)[0]; r2: (typeof ranges)[0]; d: number } | null = null;
      for (let i = 0; i < rangesByTerm.length; i++) {
        for (let j = i + 1; j < rangesByTerm.length; j++) {
          for (const r1 of rangesByTerm[i]) {
            for (const r2 of rangesByTerm[j]) {
              const d = gap(r1, r2);
              if (bestPair === null || d < bestPair.d) bestPair = { r1, r2, d };
            }
          }
        }
      }
      if (bestPair) {
        const start = Math.min(bestPair.r1.start, bestPair.r2.start);
        const end = Math.max(bestPair.r1.end, bestPair.r2.end);
        const snippetStart = Math.max(0, start - snippetPadding);
        const snippetEnd = Math.min(value.length, end + 1 + snippetPadding);
        let snippet = value.slice(snippetStart, snippetEnd);
        if (snippetStart > 0) snippet = "…" + snippet;
        if (snippetEnd < value.length) snippet = snippet + "…";
        if (snippet.length > maxSnippetLen) {
          snippet = snippet.slice(0, maxSnippetLen - 1) + "…";
        }
        const matchedText = [bestPair.r1.text, bestPair.r2.text].filter(Boolean).join(" ");
        return { snippet, matchedText };
      }
    }
  }

  const exactTermMatches = terms.length
    ? ranges.filter((r) => terms.some((t) => rangeTextLower(r) === t))
    : [];
  const containsTermMatches = terms.length
    ? ranges.filter((r) => terms.some((t) => rangeTextLower(r).includes(t) || t.includes(rangeTextLower(r))))
    : [];
  let chosen: (typeof ranges)[0];
  if (exactTermMatches.length > 0) {
    chosen = exactTermMatches.reduce((a, b) => (a.text.length <= b.text.length ? a : b));
  } else if (containsTermMatches.length > 0) {
    chosen = containsTermMatches.reduce((a, b) => (a.text.length <= b.text.length ? a : b));
  } else {
    chosen = ranges.reduce((a, b) => (a.text.length <= b.text.length ? a : b));
  }
  const { start, end, text: matchedText } = chosen;
  const snippetStart = Math.max(0, start - snippetPadding);
  const snippetEnd = Math.min(value.length, end + 1 + snippetPadding);
  let snippet = value.slice(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = "…" + snippet;
  if (snippetEnd < value.length) snippet = snippet + "…";
  if (snippet.length > maxSnippetLen) {
    snippet = snippet.slice(0, maxSnippetLen - 1) + "…";
  }
  return { snippet, matchedText };
}

/**
 * Minimum character distance between any range matching one term and any range matching another.
 * Used to rank results: when the user types multiple terms, results where terms appear close
 * together rank higher. Returns Infinity if we can't find ranges for at least two terms.
 */
function proximityBetweenTerms(
  match: { value?: string; indices?: ReadonlyArray<[number, number]> },
  terms: string[]
): number {
  const value = match.value ?? "";
  const indices = match.indices ?? [];
  if (indices.length === 0 || terms.length < 2) return Infinity;
  const termLower = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
  if (termLower.length < 2) return Infinity;
  const ranges = indices.map(([s, e]) => ({ start: s, end: e, text: value.slice(s, e + 1).toLowerCase().trim() }));
  const rangesByTerm = termLower.map((term) =>
    ranges.filter((r) => r.text === term || r.text.includes(term) || term.includes(r.text))
  );
  if (rangesByTerm.some((arr) => arr.length === 0)) return Infinity;
  let minDistance = Infinity;
  const gap = (a: { start: number; end: number }, b: { start: number; end: number }) => {
    if (a.end < b.start) return b.start - a.end - 1;
    if (b.end < a.start) return a.start - b.end - 1;
    return 0;
  };
  for (let i = 0; i < rangesByTerm.length; i++) {
    for (let j = i + 1; j < rangesByTerm.length; j++) {
      for (const r1 of rangesByTerm[i]) {
        for (const r2 of rangesByTerm[j]) {
          const d = gap(r1, r2);
          if (d < minDistance) minDistance = d;
        }
      }
    }
  }
  return minDistance;
}

/**
 * Global search across all enabled modules (with explicit user, for API routes).
 * Returns all matching items ordered by relevance (substring + fuzzy weight).
 * Query must appear in full or as part of a word; no spurious substring matches (e.g. "search" won't match "ear").
 */
export async function globalSearchForUser(
  user: CurrentUser,
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0 };
  }

  const searchTerm = query.trim();

  const [userPermissions, canViewTickets, canViewTasks, canViewTimeTracking, canViewLinks] =
    await Promise.all([
      getUserPermissions(user.id),
      canUserViewModule(user.id, MODULE_KEYS.TICKETS),
      canUserViewModule(user.id, MODULE_KEYS.TODOS),
      canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING),
      canUserViewModule(user.id, MODULE_KEYS.LINKS),
    ]);

  const searchPromises: Promise<ScoredSearchResult[]>[] = [
    searchUsers(searchTerm, user, userPermissions),
  ];
  if (canViewTickets)
    searchPromises.push(searchTickets(searchTerm, user, GLOBAL_SEARCH_CAP_PER_TYPE, userPermissions));
  if (canViewTasks)
    searchPromises.push(searchTasks(searchTerm, user, GLOBAL_SEARCH_CAP_PER_TYPE, userPermissions));
  if (canViewTimeTracking)
    searchPromises.push(searchTimeEntries(searchTerm, user, GLOBAL_SEARCH_CAP_PER_TYPE, userPermissions));
  if (canViewLinks)
    searchPromises.push(searchLinks(searchTerm, user, GLOBAL_SEARCH_CAP_PER_TYPE, userPermissions));
  searchPromises.push(searchSettings(searchTerm, user, GLOBAL_SEARCH_CAP_PER_TYPE));

  const scoredArrays = await Promise.all(searchPromises);
  const merged: ScoredSearchResult[] = scoredArrays.flat();
  merged.sort((a, b) => a.score - b.score);

  const total = merged.length;
  const results = merged.slice(0, limit).map((s) => s.result);

  return { results, total };
}

/**
 * Global search across all enabled modules (session auth).
 * Supports tickets, users, and time entries.
 */
export async function globalSearch(query: string, limit: number = 10): Promise<SearchResponse> {
  const user = await requireAuth();
  return globalSearchForUser(user, query, limit);
}

/**
 * Advanced search with filters
 */
/** Returns true if we should run the search that produces these result types (e.g. "ticket" -> run tickets). */
function shouldSearchResultType(restrictResultTypes: string[] | undefined, types: string[]): boolean {
  if (!restrictResultTypes || restrictResultTypes.length === 0) return true;
  return types.some((t) => restrictResultTypes.includes(t));
}

export async function advancedSearch(filters: SearchFilters): Promise<SearchResponse> {
  const user = await requireAuth();
  return advancedSearchForUser(user, filters);
}

export async function advancedSearchForUser(
  user: CurrentUser,
  filters: SearchFilters
): Promise<SearchResponse> {
  const restrict = filters.restrictResultTypes;
  const searchTerm = filters.query?.trim() || "";
  const results: SearchResult[] = [];

  // Get user permissions
  const userPermissions = await getUserPermissions(user.id);

  // Search users if query is provided - all authenticated users can search
  if (searchTerm && shouldSearchResultType(restrict, ["user"])) {
    const userResults = await searchUsers(searchTerm, user, userPermissions);
    results.push(...userResults.map((s) => s.result));
  }

  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  if (canViewTickets && shouldSearchResultType(restrict, ["ticket", "comment"])) {
    const ticketResults = await searchTicketsWithFilters(searchTerm, user, filters, userPermissions);
    results.push(...ticketResults);
  }

  const canViewTimeTracking = await canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING);
  if (canViewTimeTracking && shouldSearchResultType(restrict, ["timeentry"])) {
    const timeEntryResults = await searchTimeEntries(searchTerm, user, filters.limit || 100, userPermissions);
    results.push(...timeEntryResults.map((s) => s.result));
  }

  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TODOS);
  if (canViewTasks && searchTerm && shouldSearchResultType(restrict, ["task", "subtask"])) {
    const taskResults = await searchTasks(searchTerm, user, filters.limit || 100, userPermissions);
    results.push(...taskResults.map((s) => s.result));
  }

  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);
  if (canViewLinks && searchTerm && shouldSearchResultType(restrict, ["link"])) {
    const linkResults = await searchLinks(
      searchTerm,
      user,
      filters.limit || 100,
      userPermissions,
      filters.restrictLinkType
    );
    results.push(...linkResults.map((s) => s.result));
  }

  if (searchTerm && shouldSearchResultType(restrict, ["setting"])) {
    const settingsResults = await searchSettings(searchTerm, user, filters.limit || 50);
    results.push(...settingsResults.map((s) => s.result));
  }

  return {
    results,
    total: results.length,
  };
}

/**
 * Enhanced search: only FUZZY params (search, label, tag, description) are combined into
 * the text query; STRICT params (date, timestamp, type) are exact filters. When a strict
 * filter matches nothing, the search returns no results.
 */
export async function enhancedSearch(params: EnhancedSearchParams): Promise<SearchResponse> {
  const user = await requireAuth();
  return enhancedSearchForUser(user, params);
}

/**
 * Same as enhancedSearch but takes an explicit user (for API routes with Bearer auth).
 */
export async function enhancedSearchForUser(
  user: CurrentUser,
  params: EnhancedSearchParams
): Promise<SearchResponse> {
  const parts: string[] = [];
  for (const key of ENHANCED_SEARCH_FUZZY_PARAM_KEYS) {
    const value = params[key]?.trim();
    if (value) parts.push(value);
  }
  const query = parts.join(" ").trim();

  let createdFrom: string | undefined;
  let createdTo: string | undefined;

  if (params.date?.trim()) {
    const d = params.date.trim();
    createdFrom = d;
    createdTo = d;
  }
  if (params.timestamp?.trim()) {
    const range = parseTimestampRange(params.timestamp);
    if (range.from) createdFrom = createdFrom ? createdFrom : range.from;
    if (range.to) createdTo = range.to;
  }

  const { resultTypes, archiveOnly, linkType } = params.type?.trim()
    ? mapEnhancedTypeToResultTypes(params.type)
    : { resultTypes: undefined, archiveOnly: undefined, linkType: undefined };

  const filters: SearchFilters = {
    query: query || undefined,
    createdFrom,
    createdTo,
    limit: 100,
    // When type filter is set (e.g. type: "video"), only run the relevant search and restrict linkType at DB level
    ...(resultTypes?.length ? { restrictResultTypes: resultTypes } : {}),
    ...(linkType ? { restrictLinkType: linkType } : {}),
  };

  const { results } = await advancedSearchForUser(user, filters);

  let filtered = results;
  if (resultTypes && resultTypes.length > 0) {
    const typeSet = new Set(resultTypes);
    filtered = filtered.filter((r) => {
      if (r.type === "comment" && typeSet.has("ticket")) return true;
      return typeSet.has(r.type);
    });
  }
  if (linkType) {
    filtered = filtered.filter(
      (r) => r.type === "link" && (r.metadata?.linkType as string) === linkType
    );
  }
  if (archiveOnly) {
    filtered = filtered.filter((r) => {
      const archived = r.metadata?.archivedAt;
      return archived != null && archived !== "";
    });
  }
  if (createdFrom || createdTo) {
    const from = createdFrom ? new Date(createdFrom) : null;
    const to = createdTo ? new Date(createdTo) : null;
    if (from || to) {
      filtered = filtered.filter((r) => {
        const created = r.metadata?.createdAt;
        if (!created) return true;
        const d = typeof created === "string" ? new Date(created) : (created as Date);
        if (from && d < from) return false;
        if (to) {
          const endOfDay = new Date(to);
          endOfDay.setHours(23, 59, 59, 999);
          if (d > endOfDay) return false;
        }
        return true;
      });
    }
  }

  return {
    results: filtered,
    total: filtered.length,
  };
}

/**
 * Search users by name and email with fuzzy matching.
 * Only includes items where the search term appears in full or as part of a word.
 */
async function searchUsers(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  userPermissions: Set<string>
): Promise<ScoredSearchResult[]> {
  const canViewAllUsers =
    userPermissions.has("admin.users.view") ||
    userPermissions.has("admin.users.update") ||
    userPermissions.has("admin.users.delete") ||
    userPermissions.has("admin.users.create");

  const where: any = {
    status: { in: ["ACTIVE", "PENDING"] },
  };
  if (!canViewAllUsers) where.id = user.id;

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
      _count: { select: { createdTickets: true, assignedTickets: true } },
    },
    take: candidateLimit,
  });

  const fuzzyResults = fuzzySearch(allUsers, searchTerm, {
    keys: [{ name: "name", weight: 0.7 }, { name: "email", weight: 0.3 }],
    threshold: 0.4,
    minMatchCharLength: 2,
  });

  const filtered = filterFuzzyBySubstringMatch(
    fuzzyResults,
    searchTerm,
    (u) => `${u.name ?? ""} ${u.email ?? ""}`
  );
  const scored = sortByScore(filtered, GLOBAL_SEARCH_CAP_PER_TYPE);

  return scored.map(({ item: u, score }) => {
    const url =
      !canViewAllUsers && u.id === user.id ? "/dashboard/profile" : `/dashboard/users/${u.id}`;
    const title = formatUserName(u);
    const description = u.email !== title ? u.email : undefined;
    const matchInTitle = termInText(searchTerm, u.name);
    const matchInDesc = termInText(searchTerm, u.email);
    const context: string | undefined =
      !matchInTitle && matchInDesc && !description ? "Email" : undefined;
    return {
      score,
      result: {
        type: "user" as const,
        id: u.id,
        title,
        description,
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
        context,
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
      const commentOnlyMatch = !matchedViaOtherFields && matchingComments.length > 0;
      const firstCommentSnippet = commentOnlyMatch && matchingComments[0]
        ? truncateForContext(matchingComments[0].content, 100)
        : undefined;
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
        context: commentOnlyMatch && firstCommentSnippet ? `Comment: ${firstCommentSnippet}` : undefined,
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
      const commentSnippet = truncateForContext(item.content, 100);
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
          context: `Comment: ${commentSnippet}`,
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
 * Search time entries by name, description, tags, and location with fuzzy matching.
 * Only includes items where the search term appears in full or as part of a word.
 */
async function searchTimeEntries(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>
): Promise<ScoredSearchResult[]> {
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
      breaks: {
        select: { duration: true },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  if (!searchTerm || searchTerm.trim().length === 0) {
    return timeEntries.slice(0, limit).map((entry, i) => ({
      score: i,
      result: {
        type: "timeentry" as const,
        id: entry.id,
        title: entry.name,
        description: entry.description || undefined,
        url: `/dashboard/time-tracking/${entry.id}`,
        metadata: {
          timerNumber: formatTimerNumber(entry.name, entry.id),
          status: entry.status,
          tags: entry.tags,
          location: entry.location,
          totalDuration: entry.totalDuration,
          breakDurationSeconds: entry.breaks?.reduce((sum, b) => sum + (b.duration ?? 0), 0) ?? 0,
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
      },
    }));
  }

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

  const fuzzyResults = fuzzySearch(entriesForFuzzy, searchTerm, {
    keys: [
      { name: "name", weight: 0.5 },
      { name: "description", weight: 0.3 },
      { name: "location", weight: 0.1 },
      { name: "tagsString", weight: 0.1 },
    ],
    threshold: 0.4,
    minMatchCharLength: 2,
  });

  const filtered = filterFuzzyBySubstringMatch(
    fuzzyResults,
    searchTerm,
    (e) => e.searchableText
  );
  const scored = sortByScore(filtered, limit);

  return scored.map(({ item: entry, score }) => {
    const title = entry.name;
    const description = entry.description || undefined;
    const matchInTitle = termInText(searchTerm, title);
    const matchInDesc = termInText(searchTerm, description);
    let context: string | undefined;
    if (!matchInTitle && !matchInDesc) {
      if (entry.location && termInText(searchTerm, entry.location))
        context = `Location: ${truncateForContext(entry.location, 60)}`;
      else if (entry.tags?.length && entry.tags.some((t) => termInText(searchTerm, t)))
        context = `Tags: ${entry.tags.join(", ")}`;
    }
    return {
      score,
      result: {
        type: "timeentry" as const,
        id: entry.id,
        title,
        description,
        url: `/dashboard/time-tracking/${entry.id}`,
        metadata: {
          timerNumber: formatTimerNumber(entry.name, entry.id),
          status: entry.status,
          tags: entry.tags,
          location: entry.location,
          totalDuration: entry.totalDuration,
          breakDurationSeconds: entry.breaks?.reduce((sum, b) => sum + (b.duration ?? 0), 0) ?? 0,
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
        context,
      },
    };
  });
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
): Promise<ScoredSearchResult[]> {
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

  if (!searchTerm || searchTerm.trim().length === 0) {
    return todos.slice(0, limit).map((todo, i) => ({
      score: i,
      result: {
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
      },
    }));
  }

  const trimmed = searchTerm.trim();

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

  const todoFuzzyResults = fuzzySearch(todosForFuzzy, trimmed, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "description", weight: 0.25 },
      { name: "descriptionPlain", weight: 0.25 },
    ],
    threshold: 0.4,
    minMatchCharLength: 2,
  });

  const filtered = filterFuzzyBySubstringMatch(
    todoFuzzyResults,
    trimmed,
    (t) => t.searchableText
  );
  const scored = sortByScore(filtered, limit);

  return scored.map(({ item: todo, score }) => {
    const title = todo.title;
    const description = todo.descriptionPlain || todo.description || undefined;
    const matchInTitle = termInText(trimmed, title);
    const matchInDesc = termInText(trimmed, description);
    let context: string | undefined;
    if (!matchInTitle && !matchInDesc) {
      if (todo.todoNumber && termInText(trimmed, todo.todoNumber))
        context = `Task number: ${todo.todoNumber}`;
      else if (todo.ticket?.ticketNumber && termInText(trimmed, todo.ticket.ticketNumber))
        context = `Linked ticket: ${todo.ticket.ticketNumber}`;
      else if (todo.ticket?.title && termInText(trimmed, todo.ticket.title))
        context = `Linked ticket: ${truncateForContext(todo.ticket.title, 50)}`;
      else if (todo.parentTodo?.title && termInText(trimmed, todo.parentTodo.title))
        context = `Parent task: ${truncateForContext(todo.parentTodo.title, 50)}`;
    }
    if (todo.parentTodoId && todo.parentTodo?.title && !context) {
      context = `Subtask of: ${truncateForContext(todo.parentTodo.title, 50)}`;
    }
    return {
      score,
      result: {
        type: todo.parentTodoId ? "subtask" as const : "task" as const,
        id: todo.id,
        title,
        description,
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
        context,
      },
    };
  });
}

/**
 * Search links by title, description, url, tags, and notes with fuzzy matching.
 * Visibility rules:
 * - Users can see their own links
 * - Users can see links in collections they have access to (as owner or member)
 */
/**
 * Search links. Only includes items where the search term appears in full or as part of a word.
 */
async function searchLinks(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>,
  linkTypeFilter?: string
): Promise<ScoredSearchResult[]> {
  const where: any = {};

  // Check permissions
  const canViewAllLinks = userPermissions.has("links.view_all");
  const canViewLinks = userPermissions.has("links.view") || canViewAllLinks;

  if (!canViewLinks) {
    // User has no permission to view links
    return [];
  }

  // Restrict to link type when filtering by type: "video", type: "website", etc.
  if (linkTypeFilter) {
    where.linkType = linkTypeFilter;
  }

  // Build permission filter: user's own links OR links in collections they have access to
  if (!canViewAllLinks) {
    // Get collections where user is owner or member
    const accessibleCollections = await prisma.collection.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const accessibleCollectionIds = accessibleCollections.map((c) => c.id);

    // Links owned by user OR links in accessible collections
    where.OR = [
      { userId: user.id },
      ...(accessibleCollectionIds.length > 0
        ? [
            {
              collections: {
                some: {
                  collectionId: { in: accessibleCollectionIds },
                },
              },
            },
          ]
        : []),
    ];
  }
  // Users with view_all permission can see all links (no filter)

  // Exclude archived links by default
  where.archivedAt = null;

  // Fetch more candidates for fuzzy search (3x the limit, or at least 50)
  const candidateLimit = Math.max(limit * 3, 50);

  const links = await prisma.link.findMany({
    where,
    select: {
      id: true,
      title: true,
      url: true,
      description: true,
      tags: true,
      notes: true,
      metadata: true,
      favicon: true,
      linkType: true,
      isFavorite: true,
      rating: true,
      archivedAt: true,
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
      collections: {
        select: {
          collection: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: candidateLimit,
  });

  if (!searchTerm || searchTerm.trim().length === 0) {
    return links.slice(0, limit).map((link, i) => ({
      score: i,
      result: {
        type: "link" as const,
        id: link.id,
        title: link.title,
        description: link.description || undefined,
        url: `/dashboard/links/${link.id}`,
        metadata: {
          linkUrl: link.url,
          favicon: link.favicon,
          linkType: link.linkType,
          tags: link.tags,
          isFavorite: link.isFavorite,
          rating: link.rating,
          collections: link.collections.map((lc) => ({
            id: lc.collection.id,
            name: lc.collection.name,
            color: lc.collection.color,
          })),
          createdBy: formatUserName(link.user),
          archivedAt: link.archivedAt,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        },
      },
    }));
  }

  const trimmed = searchTerm.trim();

  const linksForFuzzy = links.map((link) => ({
    ...link,
    searchableText: [
      link.title,
      link.description || "",
      link.url,
      link.notes || "",
      ...link.tags,
    ].join(" "),
    tagsString: link.tags.join(" "),
    metadataString:
      link.metadata != null
        ? typeof link.metadata === "object"
          ? JSON.stringify(link.metadata)
          : String(link.metadata)
        : "",
  }));

  const linkFuzzyResults = fuzzySearch(linksForFuzzy, trimmed, {
    keys: [
      { name: "title", weight: 0.35 },
      { name: "description", weight: 0.2 },
      { name: "url", weight: 0.15 },
      { name: "notes", weight: 0.1 },
      { name: "tagsString", weight: 0.05 },
      { name: "metadataString", weight: 0.15 },
    ],
    threshold: 0.4,
    minMatchCharLength: 2,
    includeMatches: true,
  });

  const filtered = filterFuzzyBySubstringMatch(
    linkFuzzyResults,
    trimmed,
    (r) => r.searchableText
  );

  const terms = trimmed.split(/\s+/).filter((t) => t.length >= 2);
  const useProximity = terms.length >= 2;
  const proximityFor = (r: (typeof filtered)[0]): number => {
    if (!useProximity || !r.matches?.length) return Infinity;
    let minProx = Infinity;
    for (const m of r.matches) {
      const p = proximityBetweenTerms(m, terms);
      if (p < minProx) minProx = p;
    }
    return minProx;
  };
  const sortedWithMatches = filtered
    .sort((a, b) => {
      if (useProximity) {
        const proxA = proximityFor(a);
        const proxB = proximityFor(b);
        if (proxA !== proxB) return proxA - proxB;
      }
      return (a.score ?? 1) - (b.score ?? 1);
    })
    .slice(0, limit);

  return sortedWithMatches.map((r) => {
    const link = r.item;
    const title = link.title;
    const description = link.description || undefined;
    const matchInTitle = termInText(trimmed, title);
    const matchInDesc = termInText(trimmed, description);
    let context: string | undefined;
    let contextHighlight: string | undefined;
    if (!matchInTitle && !matchInDesc) {
      if (link.url && termInText(trimmed, link.url)) {
        context = `URL: ${truncateForContext(link.url, 60)}`;
      } else if (link.notes && termInText(trimmed, link.notes)) {
        context = `Notes: ${truncateForContext(link.notes, 60)}`;
      } else if (link.tags?.length && link.tags.some((t) => termInText(trimmed, t))) {
        context = `Tags: ${link.tags.join(", ")}`;
      } else if (link.metadata != null) {
        const metaMatch = r.matches?.find((m) => m.key === "metadataString");
        if (metaMatch?.value) {
          const { snippet, matchedText } = snippetFromFuseMatch(metaMatch, trimmed, 40, 140);
          context = `Metadata: ${snippet}`;
          const multiTerm = trimmed.split(/\s+/).filter((t) => t.length >= 2).length > 1;
          contextHighlight = multiTerm ? trimmed : (matchedText || undefined);
        } else if (termInText(trimmed, JSON.stringify(link.metadata))) {
          context = `Metadata: ${truncateForContext(JSON.stringify(link.metadata), 100)}`;
        }
      }
    }
    return {
      score: r.score ?? 1,
      result: {
        type: "link" as const,
        id: link.id,
        title,
        description,
        url: `/dashboard/links/${link.id}`,
        metadata: {
          linkUrl: link.url,
          favicon: link.favicon,
          linkType: link.linkType,
          tags: link.tags,
          isFavorite: link.isFavorite,
          rating: link.rating,
          collections: link.collections.map((lc) => ({
            id: lc.collection.id,
            name: lc.collection.name,
            color: lc.collection.color,
          })),
          createdBy: formatUserName(link.user),
          archivedAt: link.archivedAt,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        },
        context,
        contextHighlight,
      },
    };
  });
}

/**
 * Search settings that are available to the current user.
 * Only includes items where the search term appears in full or as part of a word.
 */
async function searchSettings(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number
): Promise<ScoredSearchResult[]> {
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

  // Filter settings based primarily on permissions (roles are descriptive only)
  const userPermissions = await getUserPermissions(user.id);
  const availableSettings = baseSettings.filter((setting) => {
    if (setting.category !== "system") {
      return true;
    }
    // System settings require at least one admin.* permission
    const hasAdminPermission = Array.from(userPermissions).some((p) => p.startsWith("admin."));
    return hasAdminPermission;
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

  if (exactMatches.length > 0) {
    const capped = exactMatches.slice(0, limit);
    return capped.map((setting, i) => {
      const matchInTitle = termInText(normalizedTerm, setting.title);
      const matchInDesc = termInText(normalizedTerm, setting.description);
      const matchInKeywords = setting.keywords.some((kw) => termInText(normalizedTerm, kw));
      const context: string | undefined =
        !matchInTitle && !matchInDesc && (matchInKeywords || termInText(normalizedTerm, setting.category))
          ? "Keywords"
          : undefined;
      return {
        score: i,
        result: {
          type: "setting" as const,
          id: setting.id,
          title: setting.title,
          description: setting.description,
          url: setting.url,
          metadata: { category: setting.category },
          context,
        },
      };
    });
  }

  const fuzzyResults = fuzzySearch(searchableSettings, normalizedTerm, {
    keys: [
      { name: "title", weight: 0.5 },
      { name: "description", weight: 0.3 },
      { name: "searchableText", weight: 0.2 },
    ],
    threshold: 0.3,
    minMatchCharLength: 2,
  });
  const goodMatches = fuzzyResults.filter((result) => (result.score ?? 1) <= 0.3);
  const filtered = filterFuzzyBySubstringMatch(
    goodMatches,
    normalizedTerm,
    (s) => s.searchableText
  );
  const scored = sortByScore(filtered, limit);

  return scored.map(({ item: setting, score }) => {
    const matchInTitle = termInText(normalizedTerm, setting.title);
    const matchInDesc = termInText(normalizedTerm, setting.description);
    const matchInKeywords = setting.keywords.some((kw) => termInText(normalizedTerm, kw));
    const context: string | undefined =
      !matchInTitle && !matchInDesc && (matchInKeywords || termInText(normalizedTerm, setting.category))
        ? "Keywords"
        : undefined;
    return {
      score,
      result: {
        type: "setting" as const,
        id: setting.id,
        title: setting.title,
        description: setting.description,
        url: setting.url,
        metadata: { category: setting.category },
        context,
      },
    };
  });
}

/**
 * Search tickets by title, description, ticketNumber, tags, and comments.
 * Only includes items where the search term appears in full or as part of a word.
 */
async function searchTickets(
  searchTerm: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
  limit: number,
  userPermissions: Set<string>
): Promise<ScoredSearchResult[]> {
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

  const ticketSearchableText = (t: (typeof tickets)[0]) =>
    [t.title, t.description || t.descriptionPlain || "", t.ticketNumber, ...t.tags].join(" ");

  const combinedFiltered = combinedResults.filter((cr) => {
    if (textContainsQuery(ticketSearchableText(cr.ticket), searchTerm)) return true;
    const commentMatches = commentFuzzyResults.filter((r) => r.item.ticketId === cr.ticket.id);
    return commentMatches.some((r) => textContainsQuery(r.item.content, searchTerm));
  });

  combinedFiltered.sort((a, b) => a.score - b.score);
  const topTickets = combinedFiltered.slice(0, limit).map((r) => r.ticket);

  const results: ScoredSearchResult[] = [];
  const processedTicketIds = new Set<string>();

  topTickets.forEach((ticket) => {
    const cr = combinedFiltered.find((r) => r.ticket.id === ticket.id);
    const bestScore = cr?.score ?? 1;
    processedTicketIds.add(ticket.id);

    const ticketMatch = ticketFuzzyResults.find((r) => r.item.id === ticket.id);
    const matchedViaOtherFields =
      ticketMatch !== undefined && ticketMatch.score !== undefined && ticketMatch.score < 0.5;

    const ticketCommentMatches = commentFuzzyResults
      .filter((r) => r.item.ticketId === ticket.id)
      .filter((r) => textContainsQuery(r.item.content, searchTerm))
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 5);

    const matchingComments = ticketCommentMatches.map((r) => ({
      id: r.item.id,
      content: r.item.content,
      createdAt: r.item.createdAt,
      isAgentOnly: r.item.isAgentOnly,
    }));

    if (matchedViaOtherFields || matchingComments.length > 0) {
      const commentOnlyMatch = !matchedViaOtherFields && matchingComments.length > 0;
      const firstCommentSnippet =
        commentOnlyMatch && matchingComments[0]
          ? truncateForContext(matchingComments[0].content, 100)
          : undefined;
      results.push({
        score: bestScore,
        result: {
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
          context: commentOnlyMatch && firstCommentSnippet ? `Comment: ${firstCommentSnippet}` : undefined,
        },
      });

      matchingComments.forEach((comment) => {
        results.push({
          score: bestScore,
          result: {
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
          },
        });
      });
    }
  });

  const commentFiltered = commentFuzzyResults.filter((r) =>
    textContainsQuery(r.item.content, searchTerm)
  );
  const topCommentsScored = commentFiltered
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, limit);
  topCommentsScored.forEach((scoredItem) => {
    const item = scoredItem.item;
    if (!processedTicketIds.has(item.ticketId)) {
      const ticket = item.ticket;
      const commentSnippet = truncateForContext(item.content, 100);
      const score = scoredItem.score ?? 1;
      if (!matchedTicketIds.has(item.ticketId)) {
        results.push({
          score,
          result: {
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
            context: `Comment: ${commentSnippet}`,
          },
        });
        processedTicketIds.add(item.ticketId);
      }
      results.push({
        score,
        result: {
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
        },
      });
    }
  });

  return results;
}
