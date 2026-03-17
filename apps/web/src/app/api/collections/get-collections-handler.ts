import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

const collectionSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  _count: {
    select: { links: true },
  },
} as const;

/**
 * Shared GET handler for /api/collections and /api/auth/collections (iOS app).
 * Returns collections the user owns or is a member of (non-archived by default).
 * Query: archived (true|false) — default false (only non-archived).
 */
export async function getCollectionsApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const linksEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!linksEnabled) {
      return NextResponse.json({ collections: [] }, { status: 200 });
    }

    const canView = await hasPermission(user.id, "collections.view");
    if (!canView) {
      return NextResponse.json({ collections: [] }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const archivedParam = searchParams.get("archived") ?? "false";

    const where = {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
      archivedAt: archivedParam === "true" ? ({ not: null } as const) : null,
    };

    const collections = await prisma.collection.findMany({
      where,
      select: collectionSelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ collections }, { status: 200 });
  } catch (error) {
    console.error("[GET /api/collections]", error);
    return NextResponse.json(
      { message: "Failed to load collections" },
      { status: 500 }
    );
  }
}
