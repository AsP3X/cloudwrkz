import { NextRequest } from "next/server";
import { addTimeEntryApiHandler } from "@/app/api/time-tracking/mutate-time-entry-handler";

export async function POST(request: NextRequest) {
  return addTimeEntryApiHandler(request);
}
