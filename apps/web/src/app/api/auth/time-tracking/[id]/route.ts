import { NextRequest } from "next/server";
import { getTimeEntryApiHandler } from "@/app/api/time-tracking/get-time-entries-handler";
import { updateTimeEntryApiHandler, deleteTimeEntryApiHandler } from "@/app/api/time-tracking/mutate-time-entry-handler";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return getTimeEntryApiHandler(request, id ?? "");
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return updateTimeEntryApiHandler(request, id ?? "");
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return deleteTimeEntryApiHandler(request, id ?? "");
}
