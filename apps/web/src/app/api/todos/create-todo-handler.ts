import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { createTodoWithUserId } from "@/server/actions/todos";
import type { TodoInput, TodoStatus, TodoPriority } from "@/server/actions/todos";

/**
 * POST /api/todos and /api/auth/todos (iOS app).
 * Body: { title: string, description?: string, status?: string, priority?: string, parentTodoId?: string }
 * Returns 201 { id } or 400/401/403/500.
 */
export async function createTodoApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const todosEnabled = await isModuleEnabled(MODULE_KEYS.TODOS);
    if (!todosEnabled) {
      return NextResponse.json(
        { message: "Todos module is not enabled" },
        { status: 403 }
      );
    }

    const canCreate = await hasPermission(user.id, "todos.create");
    if (!canCreate) {
      return NextResponse.json(
        { message: "You do not have permission to create todos" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const title =
      typeof body === "object" && body !== null && "title" in body
        ? String((body as { title: unknown }).title ?? "").trim()
        : "";
    const description =
      typeof body === "object" && body !== null && "description" in body
        ? String((body as { description?: unknown }).description ?? "").trim() || undefined
        : undefined;
    const status =
      typeof body === "object" && body !== null && "status" in body
        ? String((body as { status?: unknown }).status ?? "NOT_STARTED").trim()
        : "NOT_STARTED";
    const priority =
      typeof body === "object" && body !== null && "priority" in body
        ? String((body as { priority?: unknown }).priority ?? "MEDIUM").trim()
        : "MEDIUM";
    const parentTodoId =
      typeof body === "object" && body !== null && "parentTodoId" in body
        ? (() => {
            const v = (body as { parentTodoId?: unknown }).parentTodoId;
            return v && typeof v === "string" && v.length > 0 ? v : undefined;
          })()
        : undefined;

    if (!title) {
      return NextResponse.json(
        { message: "Title is required" },
        { status: 400 }
      );
    }

    const validStatuses: TodoStatus[] = [
      "NOT_STARTED",
      "IN_PROGRESS",
      "BLOCKED",
      "COMPLETED",
      "CANCELLED",
    ];
    const validPriorities: TodoPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const input: TodoInput = {
      title,
      description,
      status: validStatuses.includes(status as TodoStatus) ? (status as TodoStatus) : "NOT_STARTED",
      priority: validPriorities.includes(priority as TodoPriority) ? (priority as TodoPriority) : "MEDIUM",
      parentTodoId,
    };

    const result = await createTodoWithUserId(user.id, input);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error ?? "Failed to create todo" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { id: result.data!.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/todos]", error);
    return NextResponse.json(
      { message: "Failed to create todo" },
      { status: 500 }
    );
  }
}
