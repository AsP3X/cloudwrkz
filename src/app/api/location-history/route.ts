import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 3) {
      return NextResponse.json([], { status: 200 });
    }

    // Look up previously stored, corrected locations for this user that
    // contain the query. These records are created whenever a time entry
    // with a location is saved or updated.
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

    // Deduplicate by address string, preserve order by most recently updated
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

