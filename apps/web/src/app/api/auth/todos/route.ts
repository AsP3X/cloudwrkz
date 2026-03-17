import { NextRequest } from "next/server";
import { getTodosApiHandler } from "@/app/api/todos/get-todos-handler";
import { createTodoApiHandler } from "@/app/api/todos/create-todo-handler";

/**
 * GET /api/auth/todos
 * Same as GET /api/todos. Exists so the iOS app can use the same path prefix
 * as login (api/auth/login → api/auth/todos).
 */
export async function GET(request: NextRequest) {
  return getTodosApiHandler(request);
}

/**
 * POST /api/auth/todos
 * Same as POST /api/todos. Create a todo (or subtodo if parentTodoId set).
 */
export async function POST(request: NextRequest) {
  return createTodoApiHandler(request);
}
