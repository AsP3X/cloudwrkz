import { NextRequest } from "next/server";
import { stopTimeEntryApiHandler } from "../../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/[id]/stop
 * Stops a RUNNING or PAUSED timer.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return stopTimeEntryApiHandler(request, id ?? "");
}
