import { extendSessionIfNeeded } from "@/lib/utils/auth-server";

/**
 * POST /api/auth/extend-session
 * Authorization: Bearer <session token>
 * Extends session to 7 days from now if valid and remaining < 7 days.
 */
export async function POST(request: Request) {
  return extendSessionIfNeeded(request);
}
