import { NextRequest } from "next/server";
import { extractMetadataApiHandler } from "@/app/api/links/extract-metadata-handler";

/**
 * POST /api/auth/links/metadata
 * Same as POST /api/links/metadata (extract metadata for Add Link form).
 */
export async function POST(request: NextRequest) {
  return extractMetadataApiHandler(request);
}
