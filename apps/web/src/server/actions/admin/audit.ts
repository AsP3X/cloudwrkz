"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/utils/auth-server";

const MAX_AUDIT_PAGE_LIMIT = 200;

export type AuditLogFilters = {
  userId?: string;
  /** Filter by user email or name (contains, case-insensitive). Page-level search only. */
  userSearch?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
};

export type AuditLogEntry = {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  context: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

export type GetAuditLogResult = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type AuditWhere = {
  userId?: string;
  user?: {
    OR: Array<{
      email?: { contains: string; mode: "insensitive" };
      name?: { contains: string; mode: "insensitive" };
    }>;
  };
  action?: string;
  resourceType?: string;
  resourceId?: string;
  createdAt?: { gte?: Date; lte?: Date };
};

function buildAuditWhere(filters: {
  userId?: string;
  userSearch?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
}): AuditWhere {
  const { userId, userSearch, action, resourceType, resourceId, from, to } = filters;

  const where: AuditWhere = {};

  if (userId) where.userId = userId;

  if (userSearch?.trim()) {
    const q = userSearch.trim();
    where.user = {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  if (action) where.action = action;
  if (resourceType) where.resourceType = resourceType;
  if (resourceId) where.resourceId = resourceId;

  if (from || to) {
    where.createdAt = {};
    if (from) {
      // Interpret the date string as a calendar day in UTC to avoid
      // timezone-dependent shifting when filtering by date only.
      where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to) {
      where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    }
  }

  return where;
}

/**
 * Get audit log entries (requires audit.view permission)
 */
export async function getAuditLogEntries(
  filters: AuditLogFilters = {}
): Promise<GetAuditLogResult> {
  await requirePermission("audit.view");

  const {
    userId,
    userSearch,
    action,
    resourceType,
    resourceId,
    from,
    to,
    sortOrder = "desc",
  } = filters;

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit =
    filters.limit && filters.limit > 0
      ? Math.min(filters.limit, MAX_AUDIT_PAGE_LIMIT)
      : 50;

  const skip = (page - 1) * limit;

  const where = buildAuditWhere({
    userId,
    userSearch,
    action,
    resourceType,
    resourceId,
    from,
    to,
  });

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: sortOrder },
      skip,
      take: limit,
      select: {
        id: true,
        userId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        context: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: entries as AuditLogEntry[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get distinct action values for the audit log filter dropdown (Option A: from DB).
 */
export async function getAuditLogActionOptions(): Promise<string[]> {
  await requirePermission("audit.view");
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}

export type AuditLogUserOption = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Get users for the audit log user filter (combobox). Returns users who have audit log entries,
 * with optional search on name/email, limit 50.
 */
export async function getUsersForAuditFilter(
  search?: string
): Promise<AuditLogUserOption[]> {
  await requirePermission("audit.view");
  const userIds = await prisma.auditLog.findMany({
    distinct: ["userId"],
    where: { userId: { not: null } },
    select: { userId: true },
  });
  const ids = userIds
    .map((r) => r.userId)
    .filter((id): id is string => id != null);
  if (ids.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: ids },
      ...(search && search.trim()
        ? {
            OR: [
              { email: { contains: search.trim(), mode: "insensitive" as const } },
              { name: { contains: search.trim(), mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, email: true, name: true },
    take: 50,
    orderBy: { email: "asc" },
  });
  return users;
}

/**
 * Get a single user's label (email/name) for the filter chip when userId is in URL.
 */
export async function getAuditLogUserLabel(
  userId: string
): Promise<{ email: string; name: string | null } | null> {
  await requirePermission("audit.view");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  return user;
}

const EXPORT_LIMIT = 10_000;

/**
 * Export audit log with same filters as list (CSV or JSON). Gated by audit.export.
 */
export async function exportAuditLog(
  filters: Omit<AuditLogFilters, "page">,
  format: "csv" | "json"
): Promise<{ blob: string; filename: string }> {
  await requirePermission("audit.export");

  const {
    userId,
    userSearch,
    action,
    resourceType,
    resourceId,
    from,
    to,
    sortOrder = "desc",
  } = filters;

  const where = buildAuditWhere({
    userId,
    userSearch,
    action,
    resourceType,
    resourceId,
    from,
    to,
  });

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: sortOrder },
    take: EXPORT_LIMIT,
    select: {
      id: true,
      userId: true,
      action: true,
      resourceType: true,
      resourceId: true,
      context: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  const baseFilename = `audit-log-${new Date().toISOString().slice(0, 10)}`;

  if (format === "json") {
    const data = {
      entries: entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
    return {
      blob: JSON.stringify(data, null, 2),
      filename: `${baseFilename}.json`,
    };
  }

  // CSV: timestamp, action, userId, userEmail, userName, resourceType, resourceId, ipAddress, userAgent, contextJSON
  const escapeCsv = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header =
    "timestamp,action,userId,userEmail,userName,resourceType,resourceId,ipAddress,userAgent,contextJSON";
  const rows = entries.map((e) =>
    [
      e.createdAt.toISOString(),
      e.action,
      e.userId ?? "",
      e.user?.email ?? "",
      e.user?.name ?? "",
      e.resourceType ?? "",
      e.resourceId ?? "",
      e.ipAddress ?? "",
      e.userAgent ?? "",
      escapeCsv(
        e.context != null ? JSON.stringify(e.context) : ""
      ),
    ].map(escapeCsv).join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return { blob: csv, filename: `${baseFilename}.csv` };
}
