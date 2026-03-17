import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { hashPassword, verifyPassword } from "@/lib/utils/auth";
import { changePasswordSchema } from "@/lib/validations/settings";

/**
 * Shared handler for POST /api/change-password and POST /api/auth/change-password.
 * Authorization: Bearer <session token>
 * Body: { currentPassword: string, newPassword: string, confirmPassword: string }
 * Returns 200 on success, 400 validation error, 401 unauthorized or wrong current password, 500 server error.
 */
export async function changePasswordApiHandler(request: Request) {
  try {
    const user = await getCurrentUserFromBearerToken(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const validationResult = changePasswordSchema.safeParse({
      currentPassword: body?.currentPassword,
      newPassword: body?.newPassword,
      confirmPassword: body?.confirmPassword ?? body?.newPassword,
    });

    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      const message = firstError?.message ?? "Validation failed";
      return NextResponse.json({ message }, { status: 400 });
    }

    const { currentPassword, newPassword } = validationResult.data;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, password: true, status: true },
    });

    if (!dbUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (dbUser.status !== "ACTIVE") {
      return NextResponse.json(
        { message: "Your account is not active. Password cannot be changed." },
        { status: 403 }
      );
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, dbUser.password);
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { message: "Current password is incorrect" },
        { status: 401 }
      );
    }

    const newHashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { password: newHashedPassword },
    });

    return NextResponse.json({ message: "Password updated" }, { status: 200 });
  } catch (error) {
    console.error("[change-password]", error);
    return NextResponse.json(
      { message: "An error occurred while changing your password. Please try again." },
      { status: 500 }
    );
  }
}
