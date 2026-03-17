import { NextRequest } from "next/server";
import { updateTicketApiHandler } from "@/app/api/tickets/update-ticket-handler";
import { deleteTicketApiHandler } from "@/app/api/tickets/delete-ticket-handler";

/**
 * PATCH /api/auth/tickets/[id]
 * Partial update (e.g. unarchive). For iOS app.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return updateTicketApiHandler(request, id ?? "");
}

/**
 * DELETE /api/auth/tickets/[id]
 * Delete a ticket. For iOS app.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return deleteTicketApiHandler(request, id ?? "");
}
