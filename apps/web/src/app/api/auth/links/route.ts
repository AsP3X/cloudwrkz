import { NextRequest } from "next/server";
import { getLinksApiHandler } from "@/app/api/links/get-links-handler";
import { createLinkApiHandler } from "@/app/api/links/create-link-handler";

/**
 * GET /api/auth/links
 * Same as GET /api/links. Exists so the iOS app can use the same path prefix
 * as login (api/auth/login → api/auth/links).
 */
export async function GET(request: NextRequest) {
  return getLinksApiHandler(request);
}

/**
 * POST /api/auth/links
 * Same as POST /api/links (create link).
 */
export async function POST(request: NextRequest) {
  return createLinkApiHandler(request);
}
