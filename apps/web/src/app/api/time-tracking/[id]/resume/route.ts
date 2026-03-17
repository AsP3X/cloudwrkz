import { NextRequest } from "next/server";
import { resumeTimeEntryApiHandler } from "../../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/[id]/resume
 * Resumes a PAUSED timer.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return resumeTimeEntryApiHandler(request, id ?? "");
}
