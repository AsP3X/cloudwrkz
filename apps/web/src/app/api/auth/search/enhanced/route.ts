import { NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { enhancedSearchForUser } from "@/server/actions/search";
import {
  getEnhancedSearchBody,
  parseEnhancedSearchQuery,
  isEnhancedSearchQuery,
} from "@/lib/utils/enhanced-search";

/**
 * POST /api/auth/search/enhanced
 * Body: { query: string } — raw query including ">" prefix (e.g. '> search "foo", type: "ticket"')
 * Authorization: Bearer <session token>
 * Returns 200 { results: SearchResult[], total: number }.
 * Used by the iOS app for enhanced search when login path is api/auth/login.
 */
export async function POST(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body; expected { query: string }" },
      { status: 400 }
    );
  }

  const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
  if (!rawQuery || !isEnhancedSearchQuery(rawQuery)) {
    return NextResponse.json(
      { message: "Query must start with '>' for enhanced search" },
      { status: 400 }
    );
  }

  const queryBody = getEnhancedSearchBody(rawQuery);
  const parsed = parseEnhancedSearchQuery(queryBody);
  if (!parsed || Object.keys(parsed).length === 0) {
    return NextResponse.json(
      { results: [], total: 0 },
      { status: 200 }
    );
  }

  const response = await enhancedSearchForUser(user, parsed);
  return NextResponse.json(response, { status: 200 });
}
