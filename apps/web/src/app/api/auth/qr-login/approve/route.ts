import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { generateToken } from "@/lib/utils/auth";
import { auditLog } from "@/server/utils/audit-log";
import { headers } from "next/headers";

/**
 * POST /api/auth/qr-login/approve
 * Body: { requestId: string }
 * Authorization: Bearer <app session token>
 * App (already logged in) scans QR, gets requestId, calls this to approve. Creates a new web session and attaches it to the request.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUserFromBearerToken(request);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: { requestId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const requestId = body?.requestId;
    if (!requestId || typeof requestId !== "string" || requestId.length > 100) {
      return NextResponse.json(
        { message: "Invalid or missing requestId." },
        { status: 400 }
      );
    }

    const row = await prisma.qrLoginRequest.findUnique({
      where: { id: requestId },
    });

    if (!row) {
      return NextResponse.json(
        { message: "QR login request not found or expired." },
        { status: 404 }
      );
    }

    if (row.status !== "PENDING") {
      return NextResponse.json(
        { message: "This QR login request was already used or expired." },
        { status: 409 }
      );
    }

    const now = new Date();
    if (row.expiresAt < now) {
      await prisma.qrLoginRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { message: "QR login request has expired." },
        { status: 410 }
      );
    }

    const sessionToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 24 * 60 * 60 * 1000); // 1 day for web session from QR

    const headerStore = await headers();
    const ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      null;
    const userAgent = headerStore.get("user-agent") || null;

    await prisma.$transaction([
      prisma.session.create({
        data: {
          token: sessionToken,
          userId: user.id,
          expiresAt,
          deviceType: "desktop",
          deviceBrowser: "QR Login (Web)",
          userAgent: userAgent ?? undefined,
          ipAddress: ipAddress ?? undefined,
        },
      }),
      prisma.qrLoginRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          userId: user.id,
          sessionToken,
        },
      }),
    ]);

    auditLog({
      action: "auth.qr_login.approve",
      userId: user.id,
      resourceType: "qr_login_request",
      resourceId: requestId,
      context: { outcome: "success" },
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return NextResponse.json(
      { message: "Login approved. The browser will sign in shortly." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[api/auth/qr-login/approve]", error);
    return NextResponse.json(
      { message: "Failed to approve QR login." },
      { status: 500 }
    );
  }
}
