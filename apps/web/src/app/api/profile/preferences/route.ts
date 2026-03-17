import { NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";

/** Allowed locale: "system" or a 2–5 letter language code (e.g. en, de, fr). */
const LOCALE_REGEX = /^(system|[a-z]{2,5})$/;

/**
 * PATCH /api/profile/preferences
 * Authorization: Bearer <session token>
 * Body: { "locale": "en" } — display language (iOS app).
 * Returns 204 on success; 400 if body invalid; 401 if unauthorized.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { locale?: string; language?: string };
  try {
    body = (await request.json()) as { locale?: string; language?: string };
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.locale ?? body.language;
  if (raw === undefined || typeof raw !== "string") {
    return NextResponse.json(
      { message: "Missing or invalid locale" },
      { status: 400 }
    );
  }

  const locale = raw.trim().toLowerCase();
  if (!LOCALE_REGEX.test(locale)) {
    return NextResponse.json(
      { message: "Invalid locale; use 'system' or a language code (e.g. en, de)" },
      { status: 400 }
    );
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { locale },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[PATCH /api/profile/preferences]", error);
    return NextResponse.json(
      { message: "Failed to save preference" },
      { status: 500 }
    );
  }
}
