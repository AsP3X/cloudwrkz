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

    // Look up previously used locations for this user that contain the query.
    // This naturally stores any addresses that were adjusted (e.g., added
    // house numbers) when the time entry was saved.
    const raw = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        location: {
          not: null,
          mode: "insensitive",
          contains: query,
        },
      },
      select: {
        location: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 25,
    });

    // Deduplicate by location string, preserve order by most recently updated
    const seen = new Set<string>();
    const locations: string[] = [];

    for (const entry of raw) {
      if (!entry.location) continue;
      if (seen.has(entry.location)) continue;
      seen.add(entry.location);
      locations.push(entry.location);
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

