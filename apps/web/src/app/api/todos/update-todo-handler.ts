import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { updateTodoWithUserId } from "@/server/actions/todos";
import type { TodoUpdateInput, TodoStatus, TodoPriority } from "@/server/actions/todos";

/**
 * PATCH /api/todos/[id] and /api/auth/todos/[id] (iOS app).
 * Body: { status?, priority?, title?, ... } — partial update.
 * Returns 200 or 400/401/403/404/500.
 */
export async function updateTodoApiHandler(
  request: NextRequest,
  todoId: string
): Promise<NextResponse> {
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

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const input: TodoUpdateInput = {};
    if (typeof body.status === "string") {
      const valid: TodoStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];
      if (valid.includes(body.status as TodoStatus)) {
        input.status = body.status as TodoStatus;
      }
    }
    if (typeof body.priority === "string") {
      const valid: TodoPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
      if (valid.includes(body.priority as TodoPriority)) {
        input.priority = body.priority as TodoPriority;
      }
    }
    if (typeof body.title === "string" && body.title.trim()) {
      input.title = body.title.trim();
    }
    if (body.archivedAt === null) {
      input.archivedAt = null;
    }

    const result = await updateTodoWithUserId(user.id, todoId, input);

    if (!result.success) {
      const status =
        result.error === "Todo not found" ? 404 : result.error?.includes("permission") ? 403 : 400;
      return NextResponse.json(
        { message: result.error ?? "Failed to update todo" },
        { status }
      );
    }

    return NextResponse.json({ success: true, message: result.message }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/todos/[id]]", error);
    return NextResponse.json(
      { message: "Failed to update todo" },
      { status: 500 }
    );
  }
}
