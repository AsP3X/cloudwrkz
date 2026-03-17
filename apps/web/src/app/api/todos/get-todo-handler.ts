import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import {
  todoSelect,
  userHasAnyTodoPermission,
  agentHasTicketAccess,
} from "./get-todos-handler";

/**
 * GET a single todo by id with subtodos (for iOS detail refresh).
 * Used by GET /api/todos/[id] and GET /api/auth/todos/[id].
 */
export async function getTodoApiHandler(
  request: NextRequest,
  id: string
): Promise<NextResponse> {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const todosEnabled = await isModuleEnabled(MODULE_KEYS.TODOS);
    if (!todosEnabled) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (!(await userHasAnyTodoPermission(user.id))) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (!id) {
      return NextResponse.json({ message: "Invalid id" }, { status: 400 });
    }

    const todo = await prisma.todo.findUnique({
      where: { id },
      select: todoSelect,
    });

    if (!todo) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // allow
    } else if (user.role === "AGENT") {
      if (todo.assignedToId === user.id) {
        // allow
      } else if (todo.ticketId) {
        const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
        if (!hasAccess) {
          return NextResponse.json({ message: "Not found" }, { status: 404 });
        }
      } else {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
      }
    } else {
      if (todo.assignedToId !== user.id) {
        return NextResponse.json({ message: "Not found" }, { status: 404 });
      }
    }

    return NextResponse.json(todo, { status: 200 });
  } catch (error) {
    console.error("[GET /api/todos/[id]]", error);
    return NextResponse.json(
      { message: "Failed to load todo" },
      { status: 500 }
    );
  }
}
