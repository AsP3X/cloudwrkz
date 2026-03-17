import { NextRequest } from "next/server";
import { getTimeEntryApiHandler } from "../get-time-entries-handler";
import { updateTimeEntryApiHandler, deleteTimeEntryApiHandler } from "../mutate-time-entry-handler";

/**
 * GET /api/time-tracking/[id]
 * Returns a single time entry with breaks.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return getTimeEntryApiHandler(request, id ?? "");
}

/**
 * PATCH /api/time-tracking/[id]
 * Body: { name?, description?, tags?, location?, billable? }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return updateTimeEntryApiHandler(request, id ?? "");
}

/**
 * DELETE /api/time-tracking/[id]
 * Deletes the time entry and its breaks.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return deleteTimeEntryApiHandler(request, id ?? "");
}
