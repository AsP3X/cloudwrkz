import { extendSessionIfNeeded } from "@/lib/utils/auth-server";

/**
 * POST /api/extend-session
 * Authorization: Bearer <session token>
 * Extends session to 7 days from now if valid and remaining < 7 days.
 * Used by the iOS app (when login path is api/login) when user opens the app.
 */
export async function POST(request: Request) {
  return extendSessionIfNeeded(request);
}
