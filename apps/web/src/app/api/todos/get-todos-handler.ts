import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

/**
 * Check if an agent has access to a ticket (same logic as server/actions/todos).
 * Exported for use by get-todo-handler.
 */
export async function agentHasTicketAccess(agentId: string, ticketId: string): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      createdById: true,
      assignedToId: true,
      assignedToGroupId: true,
    },
  });

  if (!ticket) return false;
  if (ticket.createdById === agentId || ticket.assignedToId === agentId) return true;
  if (ticket.assignedToGroupId) {
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: { userId: agentId, groupId: ticket.assignedToGroupId },
      },
    });
    if (membership) return true;
  }
  return false;
}

export async function userHasAnyTodoPermission(userId: string): Promise<boolean> {
  return (
    (await hasPermission(userId, "todos.view")) ||
    (await hasPermission(userId, "todos.create")) ||
    (await hasPermission(userId, "todos.update")) ||
    (await hasPermission(userId, "todos.delete")) ||
    (await hasPermission(userId, "todos.assign"))
  );
}

/** Shared select for todo list and single-todo GET. Exported for get-todo-handler. */
export const todoSelect = {
  id: true,
  todoNumber: true,
  title: true,
  description: true,
  descriptionPlain: true,
  status: true,
  priority: true,
  estimatedHours: true,
  startDate: true,
  dueDate: true,
  completedDate: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  parentTodoId: true,
  parentTodo: {
    select: {
      id: true,
      title: true,
      todoNumber: true,
    },
  },
  ticketId: true,
  assignedToId: true,
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  ticket: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
    },
  },
  subtodos: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
    },
    orderBy: [{ order: Prisma.SortOrder.asc }, { createdAt: Prisma.SortOrder.asc }],
  },
  _count: {
    select: { subtodos: true },
  },
};

/**
 * Shared GET handler for /api/todos and /api/auth/todos (iOS app).
 * Query: status, priority, sort, archive (default unarchived).
 */
export async function getTodosApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const todosEnabled = await isModuleEnabled(MODULE_KEYS.TODOS);
    if (!todosEnabled) {
      return NextResponse.json({ todos: [] }, { status: 200 });
    }

    if (!(await userHasAnyTodoPermission(user.id))) {
      return NextResponse.json({ todos: [] }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") ?? "ALL";
    const priorityParam = searchParams.get("priority") ?? "ALL";
    const sortParam = searchParams.get("sort") ?? "createdAt-desc";
    const archiveParam = searchParams.get("archive") ?? "unarchived";
    const includeSubtodosParam = searchParams.get("includeSubtodos") ?? "false";

    const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "dueDate", "asc" | "desc"];
    const includeSubtodos = includeSubtodosParam === "true" || includeSubtodosParam === "1";

    type Where = Record<string, unknown>;
    const whereClause: Where = {};

    if (archiveParam === "archived") {
      whereClause.archivedAt = { not: null };
    } else {
      whereClause.archivedAt = null;
    }

    if (!includeSubtodos) {
      whereClause.parentTodoId = null;
    }

    if (statusParam && statusParam !== "ALL") {
      whereClause.status = statusParam;
    }
    if (priorityParam && priorityParam !== "ALL") {
      whereClause.priority = priorityParam;
    }

    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // no extra filter
    } else if (user.role === "AGENT") {
      whereClause.OR = [
        { assignedToId: user.id },
        { ticketId: { not: null } },
      ];
    } else {
      whereClause.assignedToId = user.id;
    }

    const dueOrder = sortOrder === "asc" ? ("asc" as const) : ("desc" as const);
    const orderBy =
      sortBy === "dueDate"
        ? [
            { order: "asc" as const },
            { dueDate: dueOrder },
            { createdAt: "desc" as const },
          ]
        : [
            { order: "asc" as const },
            { createdAt: dueOrder },
          ];

    const todos = await prisma.todo.findMany({
      where: whereClause,
      select: todoSelect,
      orderBy,
    });

    let filtered = todos;
    if (user.role === "AGENT") {
      const access = await Promise.all(
        todos.map(async (t) => {
          if (t.assignedToId === user.id) return true;
          if (t.ticketId) return agentHasTicketAccess(user.id, t.ticketId);
          return false;
        })
      );
      filtered = todos.filter((_, i) => access[i]);
    }

    return NextResponse.json({ todos: filtered }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/todos]", error);
    return NextResponse.json(
      { message: "Failed to load todos" },
      { status: 500 }
    );
  }
}
