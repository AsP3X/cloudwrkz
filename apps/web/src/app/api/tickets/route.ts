import { NextRequest } from "next/server";
import { getTicketsApiHandler } from "./get-tickets-handler";

/**
 * GET /api/tickets
 * Authorization: Bearer <session token>
 * Query: status, sort, createdBy, assignedToGroup, createdFrom, createdTo, updatedFrom, updatedTo
 * Returns 200 { tickets: Ticket[] }.
 */
export async function GET(request: NextRequest) {
  return getTicketsApiHandler(request);
}
