import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { extractLinkMetadata } from "@/lib/utils/link-metadata";
import { formatLinkUrl } from "@/lib/utils/links";

/**
 * POST handler: extract title, description, favicon from a URL.
 * Body: { url: string }. Returns 200 { title?, description?, favicon? }.
 */
export async function extractMetadataApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const linksEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!linksEnabled) {
      return NextResponse.json(
        { message: "Links module is not enabled" },
        { status: 403 }
      );
    }

    const canView = await hasPermission(user.id, "links.view");
    const canCreate = await hasPermission(user.id, "links.create");
    if (!canView && !canCreate) {
      return NextResponse.json(
        { message: "You do not have permission to access links" },
        { status: 403 }
      );
    }

    let body: { url?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const rawUrl =
      typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl || rawUrl.length > 2048) {
      return NextResponse.json(
        { message: "URL is required and must be at most 2048 characters" },
        { status: 400 }
      );
    }

    const url = formatLinkUrl(rawUrl);
    const metadata = await extractLinkMetadata(url);

    return NextResponse.json(
      {
        title: metadata?.title ?? undefined,
        description: metadata?.description ?? undefined,
        favicon: metadata?.favicon ?? undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[POST /api/links/metadata]", error);
    return NextResponse.json(
      { message: "Failed to extract metadata" },
      { status: 500 }
    );
  }
}
