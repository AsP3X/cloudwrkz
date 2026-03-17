import { NextRequest } from "next/server";
import { addTimeEntryApiHandler } from "../mutate-time-entry-handler";

/**
 * POST /api/time-tracking/add
 * Body: { name, description?, tags?, location?, billable?, hours, minutes, seconds, startedAt }
 * Creates a STOPPED time entry with manual duration. Returns 201 { id }.
 */
export async function POST(request: NextRequest) {
  return addTimeEntryApiHandler(request);
}
