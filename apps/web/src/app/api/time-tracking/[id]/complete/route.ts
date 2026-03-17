import { NextRequest } from "next/server";
import { completeTimeEntryApiHandler } from "../../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/[id]/complete
 * Marks a STOPPED time entry as COMPLETED.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return completeTimeEntryApiHandler(request, id ?? "");
}
