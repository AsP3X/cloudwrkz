import { NextRequest } from "next/server";
import { getActiveTimeEntriesApiHandler } from "../get-time-entries-handler";

/**
 * GET /api/time-tracking/active
 * Returns RUNNING and PAUSED time entries for the current user.
 */
export async function GET(request: NextRequest) {
  return getActiveTimeEntriesApiHandler(request);
}
