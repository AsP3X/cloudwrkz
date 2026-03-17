import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { createLinkWithUserId } from "@/server/actions/links";
import type { LinkInput } from "@/server/actions/links";

/**
 * POST /api/links and /api/auth/links (iOS app).
 * Body: { url: string, title?: string, description?: string, favicon?: string, collectionIds?: string[] }
 * When the client (e.g. iOS app) sends favicon (from its metadata fetch), it is passed to the action
 * so the server can cache it under /uploads/favicons and persist it on the link.
 * Returns 201 { id } or 400/401/403/500.
 */
export async function createLinkApiHandler(request: NextRequest) {
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

    const canCreate = await hasPermission(user.id, "links.create");
    if (!canCreate) {
      return NextResponse.json(
        { message: "You do not have permission to create links" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const url =
      typeof body === "object" && body !== null && "url" in body
        ? String((body as { url: unknown }).url ?? "")
        : "";
    const title =
      typeof body === "object" && body !== null && "title" in body
        ? String((body as { title?: unknown }).title ?? "").trim() || undefined
        : undefined;
    const description =
      typeof body === "object" && body !== null && "description" in body
        ? String((body as { description?: unknown }).description ?? "").trim() || undefined
        : undefined;
    const favicon =
      typeof body === "object" && body !== null && "favicon" in body
        ? String((body as { favicon?: unknown }).favicon ?? "").trim() || undefined
        : undefined;
    let collectionIds: string[] | undefined;
    if (
      typeof body === "object" &&
      body !== null &&
      "collectionIds" in body &&
      Array.isArray((body as { collectionIds?: unknown }).collectionIds)
    ) {
      collectionIds = ((body as { collectionIds: unknown[] }).collectionIds as unknown[])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, 50);
    }

    if (!url || url.length > 2048) {
      return NextResponse.json(
        { message: "URL is required and must be at most 2048 characters" },
        { status: 400 }
      );
    }

    const input: LinkInput = {
      url,
      title: title || undefined,
      description: description || undefined,
      favicon: favicon || undefined,
      collectionIds: collectionIds?.length ? collectionIds : undefined,
      extractMetadata: true,
    };

    const result = await createLinkWithUserId(user.id, input);

    if (!result.success) {
      return NextResponse.json(
        { message: result.error ?? "Failed to create link" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { id: result.data!.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/links]", error);
    return NextResponse.json(
      { message: "Failed to create link" },
      { status: 500 }
    );
  }
}
