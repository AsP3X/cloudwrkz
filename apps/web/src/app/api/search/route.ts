import { NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { globalSearchForUser } from "@/server/actions/search";

/**
 * GET /api/search?q=...&limit=20
 * Authorization: Bearer <session token>
 * Returns 200 { results: SearchResult[], total: number }.
 * Used by the iOS app for fuzzy global search (tickets, todos, users, etc.).
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const response = await globalSearchForUser(user, q, limit);
  return NextResponse.json(response, { status: 200 });
}
