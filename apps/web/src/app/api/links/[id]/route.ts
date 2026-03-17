import { NextRequest } from "next/server";
import { updateLinkApiHandler } from "@/app/api/links/update-link-handler";
import { deleteLinkApiHandler } from "@/app/api/links/delete-link-handler";

/**
 * PUT /api/links/:id
 * Update a link by ID. Used by the iOS app (Bearer token auth).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return updateLinkApiHandler(request, id);
}

/**
 * DELETE /api/links/:id
 * Delete a link by ID. Used by the iOS app (Bearer token auth).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return deleteLinkApiHandler(request, id ?? "");
}
