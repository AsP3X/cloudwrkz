import { NextRequest } from "next/server";
import { getTodoApiHandler } from "../get-todo-handler";
import { updateTodoApiHandler } from "../update-todo-handler";
import { deleteTodoApiHandler } from "../delete-todo-handler";

/**
 * GET /api/todos/[id]
 * Returns a single todo with subtodos (for iOS detail refresh).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return getTodoApiHandler(request, id ?? "");
}

/**
 * PATCH /api/todos/[id]
 * Partial update (e.g. status, priority). Used by iOS app.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return updateTodoApiHandler(request, id ?? "");
}

/**
 * DELETE /api/todos/[id]
 * Delete a todo (and its subtodos). Used by iOS app.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return deleteTodoApiHandler(request, id ?? "");
}
