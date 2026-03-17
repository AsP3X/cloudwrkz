import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { deleteTodoWithUserId } from "@/server/actions/todos";

/**
 * DELETE /api/todos/[id] and /api/auth/todos/[id] (iOS app).
 * Returns 200 or 401/403/404/500.
 */
export async function deleteTodoApiHandler(
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

    const result = await deleteTodoWithUserId(user.id, todoId);

    if (!result.success) {
      const status =
        result.error === "Todo not found" ? 404 : result.error?.includes("permission") ? 403 : 400;
      return NextResponse.json(
        { message: result.error ?? "Failed to delete todo" },
        { status }
      );
    }

    return NextResponse.json({ success: true, message: result.message }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/todos/[id]]", error);
    return NextResponse.json(
      { message: "Failed to delete todo" },
      { status: 500 }
    );
  }
}
