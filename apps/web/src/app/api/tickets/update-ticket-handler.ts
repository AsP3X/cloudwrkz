import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { updateTicketWithUserId } from "@/server/actions/tickets";

/**
 * PATCH /api/tickets/[id] and /api/auth/tickets/[id] (iOS app).
 * Body: { archivedAt?: null } — unarchive when archivedAt is null.
 * Returns 200 or 400/401/403/404/500.
 */
export async function updateTicketApiHandler(
  request: NextRequest,
  ticketId: string
): Promise<NextResponse> {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
    if (!ticketsEnabled) {
      return NextResponse.json(
        { message: "Tickets module is not enabled" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const input: { archivedAt?: Date | null } = {};
    if (body.archivedAt === null) {
      input.archivedAt = null;
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json({ message: "No changes" }, { status: 200 });
    }

    const result = await updateTicketWithUserId(user.id, ticketId, input);

    if (!result.success) {
      const status =
        result.error === "Ticket not found"
          ? 404
          : result.error?.includes("permission")
            ? 403
            : 400;
      return NextResponse.json(
        { message: result.error ?? "Failed to update ticket" },
        { status }
      );
    }

    return NextResponse.json({ success: true, message: result.message }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/tickets/[id]]", error);
    return NextResponse.json(
      { message: "Failed to update ticket" },
      { status: 500 }
    );
  }
}
