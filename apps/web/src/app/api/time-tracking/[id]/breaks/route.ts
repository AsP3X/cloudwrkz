import { NextRequest } from "next/server";
import { addBreakApiHandler } from "../../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/[id]/breaks
 * Body: { startedAt?, endedAt?, description? }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const id = (params?.id ?? "").trim();
  return addBreakApiHandler(request, id);
}
