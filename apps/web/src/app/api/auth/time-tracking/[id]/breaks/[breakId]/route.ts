import { NextRequest } from "next/server";
import { deleteBreakApiHandler } from "@/app/api/time-tracking/mutate-time-entry-handler";

/**
 * DELETE /api/auth/time-tracking/[id]/breaks/[breakId]
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; breakId: string }> }
) {
  const { id, breakId } = await context.params;
  return deleteBreakApiHandler(request, id ?? "", breakId ?? "");
}
