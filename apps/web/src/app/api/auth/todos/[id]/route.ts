import { NextRequest } from "next/server";
import { getTodoApiHandler } from "@/app/api/todos/get-todo-handler";
import { updateTodoApiHandler } from "@/app/api/todos/update-todo-handler";
import { deleteTodoApiHandler } from "@/app/api/todos/delete-todo-handler";

/**
 * GET /api/auth/todos/[id]
 * Same as GET /api/todos/[id]. For iOS app path consistency.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return getTodoApiHandler(request, id ?? "");
}

/**
 * PATCH /api/auth/todos/[id]
 * Partial update (e.g. status). For iOS app.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return updateTodoApiHandler(request, id ?? "");
}

/**
 * DELETE /api/auth/todos/[id]
 * Delete a todo. For iOS app.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return deleteTodoApiHandler(request, id ?? "");
}
