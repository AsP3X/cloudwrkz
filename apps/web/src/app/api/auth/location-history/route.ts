import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";

/**
 * GET /api/auth/location-history?q=...
 * Authorization: Bearer <session token>
 * Returns 200 with same shape as /api/location-history (array of { place_id, display_name, address })
 * for use by the iOS app when using auth login path.
 */
export async function GET(request: Request) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 3) {
      return NextResponse.json([], { status: 200 });
    }

    const raw = await prisma.locationHistory.findMany({
      where: {
        userId: user.id,
        address: {
          mode: "insensitive",
          contains: query,
        },
      },
      select: {
        address: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 25,
    });

    const seen = new Set<string>();
    const locations: string[] = [];
    for (const entry of raw) {
      if (seen.has(entry.address)) continue;
      seen.add(entry.address);
      locations.push(entry.address);
    }

    const suggestions = locations.slice(0, 10).map((loc, index) => ({
      place_id: index,
      display_name: loc,
      address: {} as Record<string, unknown>,
    }));

    return NextResponse.json(suggestions, { status: 200 });
  } catch (error) {
    console.error("Error fetching location history suggestions:", error);
    return NextResponse.json([], { status: 200 });
  }
}
