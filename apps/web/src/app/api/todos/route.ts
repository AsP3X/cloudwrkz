import { NextRequest } from "next/server";
import { getTodosApiHandler } from "./get-todos-handler";
import { createTodoApiHandler } from "./create-todo-handler";

/**
 * GET /api/todos
 * Authorization: Bearer <session token>
 * Query: status, priority, sort, archive
 * Returns 200 { todos: Todo[] }.
 */
export async function GET(request: NextRequest) {
  return getTodosApiHandler(request);
}

/**
 * POST /api/todos
 * Body: { title, description?, status?, priority?, parentTodoId? }
 * Returns 201 { id } or 400/401/403/500.
 */
export async function POST(request: NextRequest) {
  return createTodoApiHandler(request);
}
