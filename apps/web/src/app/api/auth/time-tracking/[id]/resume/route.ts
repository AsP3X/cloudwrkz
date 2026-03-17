import { NextRequest } from "next/server";
import { resumeTimeEntryApiHandler } from "@/app/api/time-tracking/mutate-time-entry-handler";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return resumeTimeEntryApiHandler(request, id ?? "");
}
