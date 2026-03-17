import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { updateLinkWithUserId } from "@/server/actions/links";
import type { LinkUpdateInput } from "@/server/actions/links";

/**
 * PUT /api/links/:id and /api/auth/links/:id (iOS app).
 * Body: { url?, title?, description?, favicon?, linkType?, tags?, notes?,
 *         isFavorite?, rating?, collectionIds?, extractMetadata? }
 * Returns 200 { id } or 400/401/403/500.
 */
export async function updateLinkApiHandler(
  request: NextRequest,
  linkId: string
) {
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

    const canUpdate = await hasPermission(user.id, "links.update");
    if (!canUpdate) {
      return NextResponse.json(
        { message: "You do not have permission to update links" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const input: LinkUpdateInput = {};

    if (typeof body.url === "string") {
      input.url = body.url.trim() || undefined;
    }
    if (typeof body.title === "string") {
      input.title = body.title.trim();
    }
    if (typeof body.description === "string") {
      input.description = body.description.trim();
    }
    if (typeof body.favicon === "string") {
      input.favicon = body.favicon.trim();
    }
    if (typeof body.linkType === "string") {
      input.linkType = body.linkType as LinkUpdateInput["linkType"];
    }
    if (Array.isArray(body.tags)) {
      input.tags = (body.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 50);
    }
    if (typeof body.notes === "string") {
      input.notes = body.notes.trim();
    }
    if (typeof body.isFavorite === "boolean") {
      input.isFavorite = body.isFavorite;
    }
    if (typeof body.rating === "number") {
      input.rating = body.rating;
    } else if (body.rating === null) {
      // Signal "clear rating" – the updateLink action handles null at runtime.
      (input as Record<string, unknown>).rating = null;
    }
    if (Array.isArray(body.collectionIds)) {
      input.collectionIds = (body.collectionIds as unknown[])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, 50);
    }
    if (typeof body.extractMetadata === "boolean") {
      input.extractMetadata = body.extractMetadata;
    }
    if (body.archivedAt === null) {
      input.archivedAt = null;
    }

    const result = await updateLinkWithUserId(user.id, linkId, input);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error ?? "Failed to update link" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: result.data!.id }, { status: 200 });
  } catch (error) {
    console.error("[PUT /api/links/:id]", error);
    return NextResponse.json(
      { message: "Failed to update link" },
      { status: 500 }
    );
  }
}
