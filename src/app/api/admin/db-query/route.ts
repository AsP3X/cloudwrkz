import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";

export async function POST(request: Request) {
  try {
    await requireRole("ADMIN");

    const body = await request.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    // Very strict guard: only allow SELECT queries starting with "select"
    const normalized = query.replace(/^\s+/g, "").toLowerCase();
    if (!normalized.startsWith("select")) {
      return NextResponse.json(
        { error: "Only SELECT statements are allowed in this console" },
        { status: 400 },
      );
    }

    // Execute raw query using Prisma. We use $queryRawUnsafe here because the
    // query text is admin-provided. This endpoint is protected by requireRole("ADMIN")
    // and constrained to SELECT-only queries.
    const rows = await prisma.$queryRawUnsafe<any[]>(query);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { type: "rows", columns: [], rows: [] },
        { status: 200 },
      );
    }

    const firstRow = rows[0] as Record<string, unknown>;
    const columns = Object.keys(firstRow);

    return NextResponse.json(
      {
        type: "rows",
        columns,
        rows,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error executing admin DB query:", error);
    return NextResponse.json(
      { error: error.message || "Failed to execute query" },
      { status: 500 },
    );
  }
}

