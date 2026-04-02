import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { generateToken, hashPassword, verifyPassword } from "@/lib/utils/auth";
import { changePasswordSchema } from "@/lib/validations/settings";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

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

    const auth = request.headers.get("Authorization");
    const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!bearerToken) {
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

    const existingSession = await prisma.session.findUnique({
      where: { token: bearerToken },
      select: {
        userId: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        userAgent: true,
        ipAddress: true,
      },
    });

    if (!existingSession || existingSession.userId !== dbUser.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: { password: newHashedPassword },
      });
      await tx.session.deleteMany({ where: { userId: dbUser.id } });
      await tx.session.create({
        data: {
          token: newToken,
          userId: dbUser.id,
          expiresAt,
          deviceName: existingSession.deviceName,
          deviceType: existingSession.deviceType,
          deviceOs: existingSession.deviceOs,
          deviceBrowser: existingSession.deviceBrowser,
          userAgent: existingSession.userAgent,
          ipAddress: existingSession.ipAddress,
        },
      });
    });

    return NextResponse.json(
      { message: "Password updated", token: newToken },
      { status: 200 }
    );
  } catch (error) {
    console.error("[change-password]", error);
    return NextResponse.json(
      { message: "An error occurred while changing your password. Please try again." },
      { status: 500 }
    );
  }
}
