import { NextRequest } from "next/server";
import { getCollectionsApiHandler } from "./get-collections-handler";

/**
 * GET /api/collections
 * Authorization: Bearer <session token>
 * Query: archived (true|false)
 * Returns 200 { collections: Collection[] }.
 */
export async function GET(request: NextRequest) {
  return getCollectionsApiHandler(request);
}
