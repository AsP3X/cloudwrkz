import { changePasswordApiHandler } from "@/app/api/auth/change-password/change-password-handler";

/**
 * POST /api/change-password
 * Authorization: Bearer <session token>
 * Body: { currentPassword: string, newPassword: string, confirmPassword: string }
 * Used by the iOS app when login path is api/login.
 */
export async function POST(request: Request) {
  return changePasswordApiHandler(request);
}
