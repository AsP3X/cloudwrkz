import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/utils/auth-server";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function sanitizeIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error("Invalid identifier");
  }
  return value;
}

function sanitizeTableName(value: string): string {
  // Only allow simple public-schema table names; schema is always "public" here.
  return sanitizeIdentifier(value);
}

function sanitizeColumnName(value: string): string {
  return sanitizeIdentifier(value);
}

function formatValue(value: JsonValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";

  // For strings and objects/arrays, store as text/JSON using single-quoted literal
  const str = typeof value === "string" ? value : JSON.stringify(value);
  const escaped = str.replace(/'/g, "''");
  return `'${escaped}'`;
}

async function handleUpdate(request: Request) {
  await requirePermission("admin.db.edit_entries");

  const body = await request.json().catch(() => null) as {
    table?: string;
    idColumn?: string;
    idValue?: JsonValue;
    data?: Record<string, JsonValue>;
  } | null;

  const tableName = typeof body?.table === "string" ? body.table.trim() : "";
  const idColumnRaw = typeof body?.idColumn === "string" ? body.idColumn.trim() : "id";
  const idValue = body?.idValue;
  const data = body?.data && typeof body.data === "object" ? body.data : null;

  if (!tableName || idValue === undefined || idValue === null || !data || Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "table, idValue and data are required" },
      { status: 400 },
    );
  }

  try {
    const table = sanitizeTableName(tableName);
    const idColumn = sanitizeColumnName(idColumnRaw);

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === idColumn) continue; // never update primary key
      const col = sanitizeColumnName(key);
      setClauses.push(`"${col}" = ${formatValue(value as JsonValue)}`);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const whereValueSql = formatValue(idValue as JsonValue);
    const query = `UPDATE "public"."${table}" SET ${setClauses.join(
      ", ",
    )} WHERE "${idColumn}" = ${whereValueSql};`;

    const result = await prisma.$executeRawUnsafe(query);

    return NextResponse.json(
      { success: true, updatedCount: Number(result) || 0 },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error updating admin DB row:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update record" },
      { status: 500 },
    );
  }
}

async function handleDelete(request: Request) {
  await requirePermission("admin.db.delete_entries");

  const body = await request.json().catch(() => null) as {
    table?: string;
    idColumn?: string;
    idValue?: JsonValue;
  } | null;

  const tableName = typeof body?.table === "string" ? body.table.trim() : "";
  const idColumnRaw = typeof body?.idColumn === "string" ? body.idColumn.trim() : "id";
  const idValue = body?.idValue;

  if (!tableName || idValue === undefined || idValue === null) {
    return NextResponse.json(
      { error: "table and idValue are required" },
      { status: 400 },
    );
  }

  try {
    const table = sanitizeTableName(tableName);
    const idColumn = sanitizeColumnName(idColumnRaw);

    const whereValueSql = formatValue(idValue as JsonValue);
    const query = `DELETE FROM "public"."${table}" WHERE "${idColumn}" = ${whereValueSql};`;

    const result = await prisma.$executeRawUnsafe(query);

    return NextResponse.json(
      { success: true, deletedCount: Number(result) || 0 },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error deleting admin DB row:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete record" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // POST is used for updates
  return handleUpdate(request);
}

export async function DELETE(request: Request) {
  // DELETE is used for deletions
  return handleDelete(request);
}

