import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateSecureToken } from "@/lib/utils/auth";
import { getQrLoginRequestsPerMinute } from "@/server/lib/qr-login-rate-limit";

const QR_LOGIN_EXPIRY_MINUTES = 5;

/**
 * POST /api/auth/qr-login/request
 * Creates a one-time QR login request. No auth.
 * Returns { requestId, browserToken, expiresAt, qrPayload }.
 * browserToken is secret (for polling); qrPayload is the URL to encode in the QR (contains only requestId).
 * Rate limit: configurable max requests per minute (admin settings).
 */
export async function POST(request: Request) {
  try {
    const maxPerMinute = await getQrLoginRequestsPerMinute();

    // Rate limit: count requests in the last minute
    let recentCount = 0;
    if (prisma.qrLoginRequest) {
      try {
        const since = new Date(Date.now() - 60 * 1000);
        recentCount = await prisma.qrLoginRequest.count({
          where: { createdAt: { gte: since } },
        });
      } catch {
        recentCount = 0;
      }
    }
    if (recentCount >= maxPerMinute) {
      return NextResponse.json(
        { message: "Too many QR login attempts. Try again later." },
        { status: 429 }
      );
    }

    const browserToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + QR_LOGIN_EXPIRY_MINUTES * 60 * 1000);

    const row = await prisma.qrLoginRequest.create({
      data: {
        browserToken,
        status: "PENDING",
        expiresAt,
      },
    });

    // QR payload: URL the app will scan (same origin as this API).
    const url = new URL(request.url);
    const base = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`;
    const qrPayload = `${base.replace(/\/$/, "")}/qr-login?r=${row.id}`;

    return NextResponse.json(
      {
        requestId: row.id,
        browserToken,
        expiresAt: row.expiresAt.toISOString(),
        qrPayload,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/auth/qr-login/request]", error);
    return NextResponse.json(
      { message: "Failed to create QR login request." },
      { status: 500 }
    );
  }
}
