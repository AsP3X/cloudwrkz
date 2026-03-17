import { NextRequest } from "next/server";
import { extractMetadataApiHandler } from "../extract-metadata-handler";

/**
 * POST /api/links/metadata — extract title, description, favicon from a URL.
 * Body: { url: string }. Returns 200 { title?, description?, favicon? }.
 */
export async function POST(request: NextRequest) {
  return extractMetadataApiHandler(request);
}
