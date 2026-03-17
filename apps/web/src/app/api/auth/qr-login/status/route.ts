import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/auth/qr-login/status?requestId=xxx
 * Header: X-QR-Browser-Token: <browserToken>
 * Returns { status: "PENDING" | "APPROVED" | "EXPIRED", sessionToken?: string, expiresAt?: string }.
 * sessionToken is only present when status is APPROVED (one-time; caller should set cookie and redirect).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const browserToken = request.headers.get("x-qr-browser-token");

    if (!requestId || !browserToken) {
      return NextResponse.json(
        { message: "Missing requestId or X-QR-Browser-Token header." },
        { status: 400 }
      );
    }

    const row = await prisma.qrLoginRequest.findUnique({
      where: { id: requestId },
    });

    if (!row) {
      return NextResponse.json(
        { status: "EXPIRED", message: "Request not found or expired." },
        { status: 200 }
      );
    }

    if (row.browserToken !== browserToken) {
      return NextResponse.json(
        { message: "Invalid browser token for this request." },
        { status: 403 }
      );
    }

    const now = new Date();
    if (row.expiresAt < now || row.status === "EXPIRED") {
      if (row.status === "PENDING") {
        await prisma.qrLoginRequest.update({
          where: { id: requestId },
          data: { status: "EXPIRED" },
        });
      }
      return NextResponse.json({
        status: "EXPIRED",
        expiresAt: row.expiresAt.toISOString(),
      });
    }

    if (row.status === "APPROVED" && row.sessionToken) {
      const sessionToken = row.sessionToken;
      // One-time use: clear sessionToken so repeated polls don't expose it again
      await prisma.qrLoginRequest.update({
        where: { id: requestId },
        data: { sessionToken: null },
      });
      return NextResponse.json({
        status: "APPROVED",
        sessionToken,
        expiresAt: row.expiresAt.toISOString(),
      });
    }

    return NextResponse.json({
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[api/auth/qr-login/status]", error);
    return NextResponse.json(
      { message: "Failed to get QR login status." },
      { status: 500 }
    );
  }
}
