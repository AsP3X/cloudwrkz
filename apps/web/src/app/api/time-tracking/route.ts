import { NextRequest } from "next/server";
import { getTimeEntriesApiHandler } from "./get-time-entries-handler";
import { createTimeEntryApiHandler } from "./mutate-time-entry-handler";

/**
 * GET /api/time-tracking
 * Authorization: Bearer <session token>
 * Query: status (repeatable), sort, dateFrom, dateTo, archive
 * Returns 200 { timeEntries: TimeEntry[] }.
 */
export async function GET(request: NextRequest) {
  return getTimeEntriesApiHandler(request);
}

/**
 * POST /api/time-tracking
 * Body: { name?, description?, tags?, location?, billable?, ticketId? }
 * Creates a new RUNNING time entry. Returns 201 { id }.
 */
export async function POST(request: NextRequest) {
  return createTimeEntryApiHandler(request);
}
