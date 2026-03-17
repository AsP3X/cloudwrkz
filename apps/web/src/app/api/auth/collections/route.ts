import { NextRequest } from "next/server";
import { getCollectionsApiHandler } from "@/app/api/collections/get-collections-handler";

/**
 * GET /api/auth/collections
 * Same as GET /api/collections. Exists so the iOS app can use the same path prefix
 * as login (api/auth/login → api/auth/collections).
 */
export async function GET(request: NextRequest) {
  return getCollectionsApiHandler(request);
}
