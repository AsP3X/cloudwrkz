import { NextResponse } from "next/server";

/**
 * Minimal keep-alive endpoint - no database or heavy work.
 * Used by the client to prevent reverse proxy / load balancer idle timeouts (502).
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
