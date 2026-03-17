import { NextRequest } from "next/server";
import { getActiveTimeEntriesApiHandler } from "@/app/api/time-tracking/get-time-entries-handler";

export async function GET(request: NextRequest) {
  return getActiveTimeEntriesApiHandler(request);
}
