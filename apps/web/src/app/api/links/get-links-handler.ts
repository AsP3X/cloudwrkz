import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

const linkSelect = {
  id: true,
  title: true,
  url: true,
  description: true,
  favicon: true,
  linkType: true,
  tags: true,
  notes: true,
  isFavorite: true,
  rating: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  collections: {
    select: {
      collection: {
        select: { id: true, name: true, color: true },
      },
    },
  },
} as const;

/**
 * Shared GET handler for /api/links and /api/auth/links (iOS app).
 * Query: sort, limit, page, isFavorite (true|false), collectionId (filter by collection), archived (true|false).
 */
export async function getLinksApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const linksEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!linksEnabled) {
      return NextResponse.json({ links: [] }, { status: 200 });
    }

    const canView = await hasPermission(user.id, "links.view");
    if (!canView) {
      return NextResponse.json({ links: [] }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort") ?? "createdAt-desc";
    const limitParam = searchParams.get("limit");
    const pageParam = searchParams.get("page");
    const isFavoriteParam = searchParams.get("isFavorite");
    const collectionIdParam = searchParams.get("collectionId")?.trim() || undefined;
    const archivedParam = searchParams.get("archived") ?? "false";

    const [sortBy, sortOrder] = sortParam.split("-") as [
      "createdAt" | "updatedAt" | "title",
      "asc" | "desc"
    ];
    const limit = Math.min(
      100,
      Math.max(1, limitParam ? parseInt(limitParam, 10) : 50) || 50
    );
    const page = Math.max(1, pageParam ? parseInt(pageParam, 10) : 1) || 1;
    const skip = (page - 1) * limit;

    const orderBy =
      sortBy === "title"
        ? { title: sortOrder ?? "asc" }
        : sortBy === "updatedAt"
          ? { updatedAt: sortOrder ?? "desc" }
          : { createdAt: sortOrder ?? "desc" };

    type LinkWhere = {
      userId: string;
      archivedAt: null | { not: null };
      isFavorite?: boolean;
      collections?: {
        some: {
          collectionId: string;
          collection: {
            OR: Array<
              | { ownerId: string }
              | { members: { some: { userId: string } } }
            >;
          };
        };
      };
    };

    const where: LinkWhere = {
      userId: user.id,
      archivedAt: archivedParam === "true" ? { not: null } : null,
    };
    if (isFavoriteParam === "true") {
      where.isFavorite = true;
    }
    if (isFavoriteParam === "false") {
      where.isFavorite = false;
    }
    if (collectionIdParam) {
      where.collections = {
        some: {
          collectionId: collectionIdParam,
          collection: {
            OR: [
              { ownerId: user.id },
              { members: { some: { userId: user.id } } },
            ],
          },
        },
      };
    }

    const [links, total] = await Promise.all([
      prisma.link.findMany({
        where,
        select: linkSelect,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.link.count({ where }),
    ]);

    return NextResponse.json(
      {
        links,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/links]", error);
    return NextResponse.json(
      { message: "Failed to load links" },
      { status: 500 }
    );
  }
}
