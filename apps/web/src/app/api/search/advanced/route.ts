import { NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import {
  advancedSearchForUser,
  type SearchFilters,
} from "@/server/actions/search";

/**
 * GET /api/search/advanced
 * Query params:
 * - q: string (fuzzy text query)
 * - status, priority, type, assignedTo
 * - createdFrom, createdTo, updatedFrom, updatedTo (ISO date strings)
 * - sortBy: "createdAt" | "updatedAt"
 * - sortOrder: "asc" | "desc"
 * - limit: number (max 200, default 100)
 *
 * Returns 200 { results: SearchResult[], total: number }.
 * This mirrors the advanced fuzzy search used in the Next.js app and is
 * consumed by the Vite dashboard search page.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const assignedTo = searchParams.get("assignedTo") ?? undefined;
  const createdFrom = searchParams.get("createdFrom") ?? undefined;
  const createdTo = searchParams.get("createdTo") ?? undefined;
  const updatedFrom = searchParams.get("updatedFrom") ?? undefined;
  const updatedTo = searchParams.get("updatedTo") ?? undefined;
  const sortByParam = searchParams.get("sortBy") as SearchFilters["sortBy"] | null;
  const sortOrderParam = searchParams.get("sortOrder") as SearchFilters["sortOrder"] | null;

  const limitParam = Number.parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 100;

  const filters: SearchFilters = {
    query: q || undefined,
    status: status || undefined,
    priority: priority || undefined,
    type: type || undefined,
    assignedToId: assignedTo || undefined,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    updatedFrom: updatedFrom || undefined,
    updatedTo: updatedTo || undefined,
    sortBy: sortByParam ?? "updatedAt",
    sortOrder: sortOrderParam ?? "desc",
    limit,
  };

  const response = await advancedSearchForUser(user, filters);
  return NextResponse.json(response, { status: 200 });
}

