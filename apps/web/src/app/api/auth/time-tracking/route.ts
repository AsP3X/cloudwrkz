import { NextRequest } from "next/server";
import { getTimeEntriesApiHandler } from "@/app/api/time-tracking/get-time-entries-handler";
import { createTimeEntryApiHandler } from "@/app/api/time-tracking/mutate-time-entry-handler";

/**
 * GET /api/auth/time-tracking
 * Same as GET /api/time-tracking. Exists so the iOS app can use the same path prefix
 * as login (api/auth/login → api/auth/time-tracking).
 */
export async function GET(request: NextRequest) {
  return getTimeEntriesApiHandler(request);
}

/**
 * POST /api/auth/time-tracking
 * Same as POST /api/time-tracking.
 */
export async function POST(request: NextRequest) {
  return createTimeEntryApiHandler(request);
}
