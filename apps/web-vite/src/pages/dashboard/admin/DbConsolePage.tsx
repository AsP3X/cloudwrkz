import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/lib/constants/routes";
import {
  type DbTableMeta,
  type DbTableRowsResponse,
  deleteDbRow,
  fetchDbSchema,
  fetchDbTableRows,
  formatDbCell,
  primaryKeyFromRow,
  runReadonlySql,
  updateDbRow,
} from "@/lib/db-explorer";

const CARD_CLASS =
  "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

// Human: Full replacement database explorer — structured API browsing, schema panel, and optional read-only SQL lab.
// Agent: PERMISSIONS admin.db.view|view_entries|edit|delete|query; STATE schema+table+rows; NO client-built SELECT for browse.

export default function DbConsolePage() {
  const { user, can } = useAuth();
  const canView = can("admin.db.view");
  const canViewEntries = can("admin.db.view_entries");
  const canEdit = can("admin.db.edit_entries");
  const canDelete = can("admin.db.delete_entries");
  const canSql = can("admin.db.query");

  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [tables, setTables] = useState<DbTableMeta[]>([]);
  const [tableFilter, setTableFilter] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsData, setRowsData] = useState<DbTableRowsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [sqlText, setSqlText] = useState("SELECT 1 AS ok");
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRows, setSqlRows] = useState<unknown[] | null>(null);

  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const selectedMeta = useMemo(
    () => tables.find((t) => t.name === selectedTable) ?? null,
    [tables, selectedTable],
  );

  const filteredTables = useMemo(() => {
    const needle = tableFilter.trim().toLowerCase();
    if (!needle) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(needle));
  }, [tables, tableFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadSchema = useCallback(async () => {
    if (!canView) return;
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const res = await fetchDbSchema();
      setTables(res.tables ?? []);
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : "Failed to load schema");
      setTables([]);
    } finally {
      setSchemaLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadSchema();
  }, [loadSchema]);

  const loadRows = useCallback(async () => {
    if (!canViewEntries || !selectedTable) return;
    setRowsLoading(true);
    setRowsError(null);
    try {
      const res = await fetchDbTableRows(selectedTable, {
        page,
        limit: pageSize,
        search: debouncedSearch,
        sortColumn,
        sortOrder,
      });
      setRowsData(res);
    } catch (e) {
      setRowsError(e instanceof Error ? e.message : "Failed to load rows");
      setRowsData(null);
    } finally {
      setRowsLoading(false);
    }
  }, [canViewEntries, selectedTable, page, pageSize, debouncedSearch, sortColumn, sortOrder]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [selectedTable, debouncedSearch, pageSize, sortColumn, sortOrder]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const openEdit = (row: Record<string, unknown>) => {
    if (!selectedMeta || !rowsData) return;
    const draft: Record<string, string> = {};
    for (const col of selectedMeta.columns) {
      if (!col.editable || col.isPrimaryKey) continue;
      const val = row[col.name];
      if (val === null || val === undefined) {
        draft[col.name] = "";
      } else if (typeof val === "object") {
        draft[col.name] = JSON.stringify(val, null, 2);
      } else {
        draft[col.name] = String(val);
      }
    }
    setEditRow(row);
    setEditDraft(draft);
    setEditError(null);
  };

  const parseFieldValue = (raw: string, dataType: string): unknown => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.toUpperCase() === "NULL") return null;
    if (dataType.includes("json")) {
      return JSON.parse(trimmed);
    }
    if (dataType === "boolean") {
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      throw new Error("Boolean must be true or false");
    }
    if (
      dataType === "integer" ||
      dataType === "bigint" ||
      dataType === "smallint" ||
      dataType === "numeric" ||
      dataType === "double precision" ||
      dataType === "real"
    ) {
      const n = Number(trimmed);
      if (Number.isNaN(n)) throw new Error("Invalid number");
      return n;
    }
    return trimmed;
  };

  const handleSaveEdit = async () => {
    if (!selectedTable || !editRow || !rowsData || !selectedMeta) return;
    const pk = primaryKeyFromRow(editRow, rowsData.primaryKeys);
    if (pk.length === 0) {
      setEditError("This row has no primary key — it cannot be updated.");
      return;
    }
    const changes: Record<string, unknown> = {};
    try {
      for (const col of selectedMeta.columns) {
        if (!col.editable || col.isPrimaryKey) continue;
        const raw = editDraft[col.name];
        if (raw === undefined) continue;
        const original = editRow[col.name];
        const originalText =
          original === null || original === undefined
            ? ""
            : typeof original === "object"
              ? JSON.stringify(original)
              : String(original);
        if (raw === originalText) continue;
        changes[col.name] = parseFieldValue(raw, col.dataType);
      }
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Invalid field value");
      return;
    }
    if (Object.keys(changes).length === 0) {
      setEditError("No changes to save.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateDbRow(selectedTable, pk, changes);
      setEditRow(null);
      await loadRows();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTable || !editRow || !rowsData) return;
    const pk = primaryKeyFromRow(editRow, rowsData.primaryKeys);
    if (pk.length === 0) {
      setDeleteError("This row has no primary key — it cannot be deleted.");
      return;
    }
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await deleteDbRow(selectedTable, pk);
      setConfirmDeleteOpen(false);
      setEditRow(null);
      await loadRows();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSaving(false);
    }
  };

  const runSql = async () => {
    setSqlLoading(true);
    setSqlError(null);
    setSqlRows(null);
    try {
      const res = await runReadonlySql(sqlText);
      setSqlRows(res.rows ?? []);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setSqlLoading(false);
    }
  };

  const copyCell = async (label: string, value: unknown) => {
    const text = formatDbCell(value, 10_000);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCell(label);
      window.setTimeout(() => setCopiedCell(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!canView) {
    return (
      <div className={`${CARD_CLASS} p-12 text-center`}>
        <p className="text-neutral-500 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Database Explorer.
        </p>
        <Button asChild variant="outline">
          <Link to={ROUTES.DASHBOARD}>Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const browsePanel = (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-[520px]">
      {/* Table sidebar */}
      <aside className={`xl:col-span-3 ${CARD_CLASS} flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Tables</h2>
          <Input
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            placeholder="Filter tables…"
            aria-label="Filter tables"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {schemaLoading ? (
            <p className="p-4 text-sm text-neutral-500">Loading schema…</p>
          ) : schemaError ? (
            <p className="p-4 text-sm text-error-600">{schemaError}</p>
          ) : filteredTables.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">No tables match.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredTables.map((t) => {
                const active = selectedTable === t.name;
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      className={
                        "w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors " +
                        (active ? "bg-primary-50/70 dark:bg-primary-900/25 border-l-2 border-primary-500" : "")
                      }
                      onClick={() => setSelectedTable(t.name)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm text-neutral-900 dark:text-neutral-100 truncate">
                          {t.name}
                        </span>
                        <span className="text-xs text-neutral-500 shrink-0">~{t.rowEstimate}</span>
                      </div>
                      {t.mutationBlocked && (
                        <Badge variant="warning" className="mt-1 text-[10px]">
                          read-only
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Data grid */}
      <section className={`xl:col-span-9 ${CARD_CLASS} flex flex-col overflow-hidden`}>
        {!selectedTable ? (
          <div className="flex-1 flex items-center justify-center p-12 text-neutral-500">
            Select a table to browse rows.
          </div>
        ) : !canViewEntries ? (
          <div className="flex-1 flex items-center justify-center p-12 text-neutral-500 text-center">
            You can view schema but need <code className="text-xs">admin.db.view_entries</code> to browse data.
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedTable}
                </h2>
                {selectedMeta?.mutationBlocked && (
                  <Badge variant="warning">Mutations blocked on this table</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Search (server-side)
                  </label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search row content…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Page size
                  </label>
                  <select
                    className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="button" variant="outline" disabled={rowsLoading} onClick={() => void loadRows()}>
                  {rowsLoading ? "Loading…" : "Refresh"}
                </Button>
              </div>
            </div>

            {rowsError && (
              <div className="px-4 py-3 text-sm text-error-700 bg-error-50 dark:bg-error-900/20">{rowsError}</div>
            )}

            <div className="flex-1 overflow-auto">
              {rowsLoading && !rowsData ? (
                <p className="p-8 text-center text-neutral-500">Loading rows…</p>
              ) : rowsData && rowsData.rows.length === 0 ? (
                <p className="p-8 text-center text-neutral-500">No rows found.</p>
              ) : rowsData ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      {rowsData.columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left whitespace-nowrap">
                          <button
                            type="button"
                            className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300 hover:text-primary-600"
                            onClick={() => handleSort(col)}
                          >
                            {col}
                            {sortColumn === col ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                      ))}
                      {(canEdit || canDelete) && !selectedMeta?.mutationBlocked && (
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {rowsData.rows.map((row, idx) => (
                      <tr
                        key={`row-${idx}`}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/80 cursor-pointer"
                        onClick={() => openEdit(row)}
                      >
                        {rowsData.columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-2 font-mono text-xs max-w-[240px] truncate text-neutral-800 dark:text-neutral-200"
                            title={formatDbCell(row[col], 500)}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyCell(`${idx}-${col}`, row[col]);
                            }}
                          >
                            {formatDbCell(row[col])}
                            {copiedCell === `${idx}-${col}` && (
                              <span className="ml-1 text-primary-500">✓</span>
                            )}
                          </td>
                        ))}
                        {(canEdit || canDelete) && !selectedMeta?.mutationBlocked && (
                          <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                                Edit
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>

            {rowsData && rowsData.pagination.totalPages > 0 && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 text-sm">
                <span className="text-neutral-500">
                  Page {rowsData.pagination.page} of {rowsData.pagination.totalPages} ({rowsData.pagination.total}{" "}
                  rows)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || rowsLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= rowsData.pagination.totalPages || rowsLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );

  const schemaPanel = selectedMeta ? (
    <div className={`${CARD_CLASS} overflow-hidden`}>
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="font-mono font-semibold">{selectedMeta.name}</h2>
        <p className="text-xs text-neutral-500 mt-1">
          ~{selectedMeta.rowEstimate} rows (estimate) · {selectedMeta.columns.length} columns
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="px-4 py-2 text-left text-xs uppercase">Column</th>
            <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
            <th className="px-4 py-2 text-left text-xs uppercase">Flags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {selectedMeta.columns.map((c) => (
            <tr key={c.name}>
              <td className="px-4 py-2 font-mono">{c.name}</td>
              <td className="px-4 py-2 text-neutral-600">{c.dataType}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {c.isPrimaryKey && <Badge variant="info">PK</Badge>}
                  {!c.nullable && <Badge variant="default">NOT NULL</Badge>}
                  {c.masked && <Badge variant="warning">masked</Badge>}
                  {!c.editable && <Badge variant="default">read-only</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className={`${CARD_CLASS} p-12 text-center text-neutral-500`}>Select a table to view its schema.</div>
  );

  const sqlPanel = (
    <div className={`${CARD_CLASS} p-6 space-y-4`}>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Read-only SQL lab. Queries run in a read-only transaction; destructive keywords are rejected. All runs are
        audited.
      </p>
      <textarea
        className="w-full h-40 font-mono text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3"
        value={sqlText}
        onChange={(e) => setSqlText(e.target.value)}
        spellCheck={false}
      />
      <Button type="button" onClick={() => void runSql()} disabled={sqlLoading}>
        {sqlLoading ? "Running…" : "Run query"}
      </Button>
      {sqlError && <p className="text-sm text-error-600">{sqlError}</p>}
      {sqlRows && (
        <pre className="text-xs overflow-auto max-h-96 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
          {JSON.stringify(sqlRows, null, 2)}
        </pre>
      )}
    </div>
  );

  const tabs = [
    { id: "browse", label: "Browse", content: browsePanel },
    { id: "schema", label: "Schema", content: schemaPanel },
    ...(canSql ? [{ id: "sql", label: "SQL lab", content: sqlPanel }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className={`${CARD_CLASS} p-6 sm:p-8`}>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
          Database Explorer
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Browse and maintain PostgreSQL data through a structured, permission-gated interface. Row reads never send
          raw SQL from the browser; the optional SQL lab runs read-only with server-side guards.
        </p>
        {user?.email && (
          <p className="text-xs text-neutral-500 mt-3">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
        )}
      </div>

      <Tabs tabs={tabs} defaultTab="browse" />

      {/* Row editor */}
      <Dialog
        open={editRow !== null}
        title={selectedTable ? `Row — ${selectedTable}` : "Row"}
        description="Edit fields below. Primary keys and secret columns cannot be changed."
        onOpenChange={(open) => {
          if (!open) {
            setEditRow(null);
            setEditError(null);
            setDeleteError(null);
          }
        }}
      >
        {editRow && selectedMeta && (
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {editError && <p className="text-sm text-error-600">{editError}</p>}
            {deleteError && <p className="text-sm text-error-600">{deleteError}</p>}
            {selectedMeta.columns
              .filter((c) => c.editable && !c.isPrimaryKey)
              .map((col) => (
                <div key={col.name}>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    {col.name}{" "}
                    <span className="text-neutral-400 font-normal">({col.dataType})</span>
                  </label>
                  {col.dataType.includes("json") || (editDraft[col.name]?.includes("\n") ?? false) ? (
                    <textarea
                      className="w-full h-24 font-mono text-xs rounded-lg border border-neutral-200 dark:border-neutral-700 p-2 bg-white dark:bg-neutral-800"
                      value={editDraft[col.name] ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, [col.name]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      value={editDraft[col.name] ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, [col.name]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            {selectedMeta.columns.filter((c) => c.isPrimaryKey).length > 0 && (
              <div className="text-xs text-neutral-500 border-t pt-3">
                Primary key:{" "}
                {selectedMeta.columns
                  .filter((c) => c.isPrimaryKey)
                  .map((c) => `${c.name}=${formatDbCell(editRow[c.name], 80)}`)
                  .join(", ")}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {canDelete && !selectedMeta.mutationBlocked && (
                <Button type="button" variant="outline" onClick={() => setConfirmDeleteOpen(true)}>
                  Delete row
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              {canEdit && !selectedMeta.mutationBlocked && (
                <Button type="button" onClick={() => void handleSaveEdit()} disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        title="Delete row?"
        description="This cannot be undone. The row will be removed from the database."
        onOpenChange={setConfirmDeleteOpen}
      >
        <div className="p-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={deleteSaving} onClick={() => void handleDelete()}>
            {deleteSaving ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
