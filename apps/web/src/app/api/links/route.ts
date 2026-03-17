import { NextRequest } from "next/server";
import { getLinksApiHandler } from "./get-links-handler";
import { createLinkApiHandler } from "./create-link-handler";

/**
 * GET /api/links
 * Authorization: Bearer <session token>
 * Query: sort, limit, page, isFavorite, collectionId
 * Returns 200 { links, total, page, limit, totalPages }.
 */
export async function GET(request: NextRequest) {
  return getLinksApiHandler(request);
}

/**
 * POST /api/links
 * Body: { url, title?, description?, collectionIds? }
 * Returns 201 { id } or 400/401/403/500.
 */
export async function POST(request: NextRequest) {
  return createLinkApiHandler(request);
}
