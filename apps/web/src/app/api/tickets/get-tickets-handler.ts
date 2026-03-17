import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

const ticketSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  description: true,
  descriptionPlain: true,
  type: true,
  status: true,
  priority: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
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
    select: { comments: true },
  },
} as const;

/**
 * Shared GET handler for /api/tickets and /api/auth/tickets (iOS app).
 */
export async function getTicketsApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
    if (!ticketsEnabled) {
      return NextResponse.json({ tickets: [] }, { status: 200 });
    }

    const canViewAll = await hasPermission(user.id, "tickets.view_all");
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") ?? "UNRESOLVED";
    const sortParam = searchParams.get("sort") ?? "createdAt-desc";
    const createdBy = searchParams.get("createdBy") || undefined;
    const assignedToGroup = searchParams.get("assignedToGroup") || undefined;
    const createdFrom = searchParams.get("createdFrom") || undefined;
    const createdTo = searchParams.get("createdTo") || undefined;
    const updatedFrom = searchParams.get("updatedFrom") || undefined;
    const updatedTo = searchParams.get("updatedTo") || undefined;
    const archiveParam = searchParams.get("archive") ?? "unarchived";

    const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt", "asc" | "desc"];
    const orderBy = { [sortBy || "createdAt"]: sortOrder || "desc" } as const;

    type Where = Record<string, unknown>;
    const and: Where[] = [];

    if (statusParam && statusParam !== "ALL") {
      if (statusParam === "UNRESOLVED") {
        and.push({ status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } });
      } else {
        and.push({ status: statusParam });
      }
    }

    if (createdBy) and.push({ createdById: createdBy });
    if (assignedToGroup) and.push({ assignedToGroupId: assignedToGroup });

    if (createdFrom || createdTo) {
      const range: Where = {};
      if (createdFrom) range.gte = new Date(createdFrom);
      if (createdTo) {
        const end = new Date(createdTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      and.push({ createdAt: range });
    }
    if (updatedFrom || updatedTo) {
      const range: Where = {};
      if (updatedFrom) range.gte = new Date(updatedFrom);
      if (updatedTo) {
        const end = new Date(updatedTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      and.push({ updatedAt: range });
    }

    if (!canViewAll) {
      const visibilityOr: Where[] = [{ createdById: user.id }];
      if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
        visibilityOr.push({ assignedToId: user.id });
      }
      and.push({ OR: visibilityOr });
    }

    if (archiveParam === "archived") {
      and.push({ archivedAt: { not: null } });
    } else {
      and.push({ archivedAt: null });
    }
    const where = { AND: and };

    const tickets = await prisma.ticket.findMany({
      where,
      select: ticketSelect,
      orderBy,
    });

    return NextResponse.json({ tickets }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/tickets]", error);
    return NextResponse.json(
      { message: "Failed to load tickets" },
      { status: 500 }
    );
  }
}
