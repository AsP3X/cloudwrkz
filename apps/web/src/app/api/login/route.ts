import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/server/utils/audit-log";
import { verifyPassword, generateToken } from "@/lib/utils/auth";
import { loginSchema } from "@/lib/validations/auth";
import { headers } from "next/headers";

/**
 * POST /api/login
 * JSON body: { email: string, password: string }
 * Returns 200 { token: string, user: { name: string | null, email: string } } on success, 401/403 with { message: string } on failure.
 * Used by the iOS app; web login uses the server action and cookies.
 *
 * GET returns 405 so you can verify the route is deployed (e.g. curl https://cloudwrkz.com/api/login).
 */
export async function GET() {
  return NextResponse.json(
    { message: "Use POST with { email, password } to sign in." },
    { status: 405 }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = loginSchema.safeParse({
      email: body?.email,
      password: body?.password,
      deviceName: body?.deviceName,
      deviceType: body?.deviceType,
      deviceOs: body?.deviceOs,
      deviceBrowser: body?.deviceBrowser,
      userAgent: body?.userAgent,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    const {
      email,
      password,
      rememberMe,
      deviceName,
      deviceType,
      deviceOs,
      deviceBrowser,
      userAgent: clientReportedUserAgent,
    } = validationResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const headerStore = await headers();
    const ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      null;
    const serverUserAgent = headerStore.get("user-agent") || null;
    const userAgent = clientReportedUserAgent || serverUserAgent || null;
    const loginAuditContext = {
      emailUsed: normalizedEmail,
      rememberMe,
      deviceName: deviceName ?? undefined,
      deviceType: deviceType ?? undefined,
      deviceOs: deviceOs ?? undefined,
      deviceBrowser: deviceBrowser ?? undefined,
      userAgent: userAgent ?? undefined,
    };

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { originalEmail: normalizedEmail },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        status: true,
        emailVerified: true,
        role: true,
      },
    });

    if (!user) {
      auditLog({
        action: "auth.login.attempt",
        resourceType: "auth",
        context: {
          outcome: "failure",
          failureReason: "invalid_credentials",
          ...loginAuditContext,
        },
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (user.status === "DELETED") {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: {
          outcome: "failure",
          failureReason: "account_deleted",
          ...loginAuditContext,
        },
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        {
          message:
            "This account has been deleted. Please contact an administrator to reactivate your account.",
        },
        { status: 401 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: {
          outcome: "failure",
          failureReason: "invalid_credentials",
          ...loginAuditContext,
        },
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (user.status === "BANNED") {
      auditLog({
        action: "auth.login.attempt",
        userId: user.id,
        resourceType: "user",
        resourceId: user.id,
        context: {
          outcome: "failure",
          failureReason: "account_banned",
          ...loginAuditContext,
        },
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { message: "This account has been banned." },
        { status: 403 }
      );
    }

    if (user.status === "SUSPENDED") {
      auditLog({
        action: "auth.login.attempt",
        userId: null,
        resourceType: "user",
        resourceId: user.id,
        context: {
          outcome: "failure",
          failureReason: "account_suspended",
          ...loginAuditContext,
        },
        ipAddress,
        userAgent,
      });
      return NextResponse.json(
        { message: "Your account has been suspended. Please contact support." },
        { status: 403 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress ?? undefined,
      },
    });

    const sessionToken = generateToken();
    const expiresAt = new Date();
    // App sessions: 7 days default. Web with rememberMe: 30 days, else 24 hours.
    const isApp = [deviceType, deviceOs, deviceName].some(Boolean);
    const sessionMs = isApp
      ? 7 * 24 * 60 * 60 * 1000
      : (rememberMe ? 30 * 24 : 24) * 60 * 60 * 1000;
    expiresAt.setTime(expiresAt.getTime() + sessionMs);

    const session = await prisma.session.create({
      data: {
        token: sessionToken,
        userId: user.id,
        expiresAt,
        deviceName: deviceName ?? undefined,
        deviceType: deviceType ?? undefined,
        deviceOs: deviceOs ?? undefined,
        deviceBrowser: deviceBrowser ?? undefined,
        userAgent: userAgent ?? undefined,
        ipAddress: ipAddress ?? undefined,
      },
    });

    auditLog({
      action: "auth.login.attempt",
      userId: user.id,
      resourceType: "session",
      resourceId: session.id,
      context: {
        outcome: "success",
        sessionId: session.id,
        ...loginAuditContext,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        token: sessionToken,
        user: { name: user.name ?? null, email: user.email },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/login]", error);
    auditLog({
      action: "auth.login.attempt",
      resourceType: "auth",
      context: { outcome: "failure", failureReason: "server_error" },
    });
    return NextResponse.json(
      { message: "An error occurred while signing in. Please try again." },
      { status: 500 }
    );
  }
}
