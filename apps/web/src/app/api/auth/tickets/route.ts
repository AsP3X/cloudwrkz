import { NextRequest } from "next/server";
import { getTicketsApiHandler } from "@/app/api/tickets/get-tickets-handler";

/**
 * GET /api/auth/tickets
 * Same as GET /api/tickets. Exists so the iOS app can use the same path prefix
 * as login (api/auth/login → api/auth/tickets), avoiding 404 when only
 * api/auth/* routes are exposed or expected.
 */
export async function GET(request: NextRequest) {
  return getTicketsApiHandler(request);
}
