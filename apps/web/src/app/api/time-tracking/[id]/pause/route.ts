import { NextRequest } from "next/server";
import { pauseTimeEntryApiHandler } from "../../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/[id]/pause
 * Pauses a RUNNING timer.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return pauseTimeEntryApiHandler(request, id ?? "");
}
