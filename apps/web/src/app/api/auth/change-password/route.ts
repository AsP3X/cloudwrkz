import { changePasswordApiHandler } from "./change-password-handler";

/**
 * POST /api/auth/change-password
 * Authorization: Bearer <session token>
 * Body: { currentPassword: string, newPassword: string, confirmPassword: string }
 * Used by the iOS app when login path is api/auth/login.
 */
export async function POST(request: Request) {
  return changePasswordApiHandler(request);
}
