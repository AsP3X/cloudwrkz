// Human: Typed client helpers for the structured database explorer API (no raw SQL for browsing).
// Agent: CALLS /admin/db/schema|tables/{table}/rows|sql; EXPORTS types + fetch helpers; READ-ONLY browse vs PATCH/DELETE mutations.

import { api } from "@/api/client";

export interface DbColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  editable: boolean;
  masked: boolean;
}

export interface DbTableMeta {
  name: string;
  rowEstimate: number;
  mutationBlocked: boolean;
  columns: DbColumnMeta[];
}

export interface DbSchemaResponse {
  tables: DbTableMeta[];
}

export interface DbPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DbTableRowsResponse {
  table: string;
  columns: string[];
  primaryKeys: string[];
  rows: Array<Record<string, unknown>>;
  pagination: DbPagination;
}

export interface PrimaryKeyPart {
  column: string;
  value: unknown;
}

export async function fetchDbSchema(): Promise<DbSchemaResponse> {
  return api.get<DbSchemaResponse>("/admin/db/schema");
}

export async function fetchDbTableRows(
  table: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sortColumn?: string;
    sortOrder?: "asc" | "desc";
  },
): Promise<DbTableRowsResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.sortColumn) qs.set("sort_column", params.sortColumn);
  if (params.sortOrder) qs.set("sort_order", params.sortOrder);
  const query = qs.toString();
  const path = `/admin/db/tables/${encodeURIComponent(table)}/rows${query ? `?${query}` : ""}`;
  return api.get<DbTableRowsResponse>(path);
}

export async function updateDbRow(
  table: string,
  primaryKey: PrimaryKeyPart[],
  changes: Record<string, unknown>,
): Promise<{ success: boolean; updatedCount: number }> {
  return api.patch(`/admin/db/tables/${encodeURIComponent(table)}/rows`, {
    primaryKey,
    changes,
  });
}

export async function deleteDbRow(
  table: string,
  primaryKey: PrimaryKeyPart[],
): Promise<{ success: boolean; deletedCount: number }> {
  return api.delete(`/admin/db/tables/${encodeURIComponent(table)}/rows`, {
    body: JSON.stringify({ primaryKey }),
  });
}

export async function runReadonlySql(query: string): Promise<{ rows: unknown[]; limit: number }> {
  return api.post("/admin/db/sql", { query });
}

// Human: Builds primary-key payload from a row using server-reported key columns (supports composite keys).
// Agent: READS row + primaryKeys[]; RETURNS PrimaryKeyPart[]; SKIPS missing values.

export function primaryKeyFromRow(
  row: Record<string, unknown>,
  primaryKeys: string[],
): PrimaryKeyPart[] {
  const parts: PrimaryKeyPart[] = [];
  for (const column of primaryKeys) {
    const value = row[column];
    if (value !== undefined && value !== null) {
      parts.push({ column, value });
    }
  }
  return parts;
}

// Human: Formats cell values for grid display with truncation for wide JSON payloads.
// Agent: PURE; HANDLES null/Date/object; TRUNCATES strings > maxLen.

export function formatDbCell(value: unknown, maxLen = 120): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object" && value !== null && "toISOString" in value) {
    return (value as Date).toISOString();
  }
  let text: string;
  if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "[Object]";
    }
  } else {
    text = String(value);
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}…`;
  }
  return text;
}
