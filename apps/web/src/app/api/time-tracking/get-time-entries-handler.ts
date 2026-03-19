import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { type TimeEntryStatus } from "@/generated/prisma";

const timeEntrySelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  tags: true,
  billable: true,
  location: true,
  timezone: true,
  totalDuration: true,
  startedAt: true,
  pausedAt: true,
  stoppedAt: true,
  completedAt: true,
  lastResumedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  ticketId: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  breaks: {
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      duration: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { startedAt: "asc" as const },
  },
} as const;

/**
 * Shared GET handler for /api/time-tracking (iOS app).
 * Query: status (repeatable), sort, dateFrom, dateTo, archive.
 * Returns 200 { timeEntries: TimeEntry[] }.
 */
export async function getTimeEntriesApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return NextResponse.json({ timeEntries: [] }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const statusParams = searchParams.getAll("status");
    const sortParam = searchParams.get("sort") ?? "createdAt-desc";
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const archiveParam = searchParams.get("archive") ?? "unarchived";

    const [sortBy, sortOrder] = sortParam.split("-") as [string, string];
    const validSortFields = ["createdAt", "startedAt", "totalDuration"];
    const orderBy = {
      [validSortFields.includes(sortBy) ? sortBy : "createdAt"]: sortOrder === "asc" ? "asc" : "desc",
    } as const;

    type Where = Record<string, unknown>;
    const and: Where[] = [];

    // Only show user's own time entries
    and.push({ userId: user.id });

    // Status filter
    if (statusParams.length > 0) {
      const validStatuses: TimeEntryStatus[] = statusParams.filter(
        (s): s is TimeEntryStatus => ["RUNNING", "PAUSED", "STOPPED", "COMPLETED"].includes(s)
      );
      if (validStatuses.length > 0) {
        and.push({ status: { in: validStatuses } });
      }
    }

    // Date range
    if (dateFrom || dateTo) {
      const range: Where = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      and.push({ startedAt: range });
    }

    // Archive filter
    if (archiveParam === "archived") {
      and.push({ archivedAt: { not: null } });
    } else {
      and.push({ archivedAt: null });
    }

    const where = { AND: and };

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: timeEntrySelect,
      orderBy,
    });

    return NextResponse.json({ timeEntries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time-tracking]", error);
    return NextResponse.json(
      { message: "Failed to load time entries" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/time-tracking/active
 * Returns RUNNING and PAUSED time entries for the current user.
 */
export async function getActiveTimeEntriesApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return NextResponse.json({ timeEntries: [] }, { status: 200 });
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        status: { in: ["RUNNING", "PAUSED"] },
        archivedAt: null,
      },
      select: timeEntrySelect,
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({ timeEntries }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time-tracking/active]", error);
    return NextResponse.json(
      { message: "Failed to load active time entries" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/time-tracking/[id]
 * Returns a single time entry by ID.
 */
export async function getTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id },
      select: timeEntrySelect,
    });

    if (!timeEntry) {
      return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    }

    if (timeEntry.userId !== user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ timeEntry }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/time-tracking/[id]]", error);
    return NextResponse.json(
      { message: "Failed to load time entry" },
      { status: 500 }
    );
  }
}

export { timeEntrySelect };
