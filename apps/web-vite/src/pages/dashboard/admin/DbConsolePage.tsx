import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ROUTES } from "@/lib/constants/routes";

// Human: Dangerous admin SQL browser for listing tables, previewing rows, and editing records with diff review.
// Agent: ADMIN-only UI; FETCH table metadata + rows; Dialog edit flow; USES api /admin/db* endpoints; SHOWS DiffLines.

type RowsResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

// Human: Stringifies arbitrary SQL cell values for table previews, including NULL markers and JSON fallbacks.
// Agent: READS unknown; HANDLES Date toISOString; try JSON.stringify on objects; RETURNS string; PURE.

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object" && "toISOString" in value && typeof (value as Date).toISOString === "function") {
    return (value as Date).toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  return String(value);
}

type DiffMode = "old" | "new";

// Human: Side-by-side or old/new line diff renderer highlighting changed rows for proposed record edits.
// Agent: READS oldText,newText,mode; SPLITS by newline; COMPARES per-line equality; RETURNS fragment of div rows.

function DiffLines({
  oldText,
  newText,
  mode,
}: {
  oldText: string;
  newText: string;
  mode: DiffMode;
}) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const elements: JSX.Element[] = [];
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] ?? "";
    const newLine = newLines[i] ?? "";
    const isChanged = oldLine !== newLine;
    const lineText = mode === "old" ? oldLine : newLine;
    elements.push(
      <div
        key={`${mode}-line-${i}`}
        className={
          "whitespace-pre-wrap" +
          (isChanged
            ? mode === "old"
              ? " bg-error-100/70 dark:bg-error-900/40"
              : " bg-success-100/70 dark:bg-success-900/40"
            : "")
        }
      >
        {lineText || "\u00A0"}
      </div>
    );
  }
  return <>{elements}</>;
}

// Human: Coordinates table pickers, row queries, mutation dialogs, and auth checks for the database console experience.
// Agent: STATE tables,selectedTable,result,isEditOpen; READS can + user.role; MULTIPLE api calls for CRUD previews.

export default function DbConsolePage() {
  const { user, can } = useAuth();
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [result, setResult] = useState<RowsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [rowLimit, setRowLimit] = useState(100);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editOriginalRow, setEditOriginalRow] = useState<Record<string, unknown> | null>(null);
  const [editJson, setEditJson] = useState("");
  const [originalJson, setOriginalJson] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const canViewDb = can("admin.db.view");
  const canEditEntries = can("admin.db.edit_entries");
  const canDeleteEntries = can("admin.db.delete_entries");

  // Load tables on mount
  useEffect(() => {
    let cancelled = false;
    setTablesLoading(true);
    setTablesError(null);
    api
      .get<{ tables: string[] }>("/admin/db-tables")
      .then((data) => {
        if (!cancelled) setTables(Array.isArray(data?.tables) ? data.tables : []);
      })
      .catch((e) => {
        if (!cancelled) setTablesError(e instanceof Error ? e.message : "Failed to load tables");
      })
      .finally(() => {
        if (!cancelled) setTablesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTable = async (table: string, opts?: { search?: string; limit?: number }) => {
    setSelectedTable(table);
    setError(null);
    setIsLoading(true);
    try {
      const safeLimit = opts?.limit && opts.limit > 0 ? opts.limit : 100;
      const search = opts?.search?.trim();
      let query: string;
      if (search) {
        const escaped = search.replace(/'/g, "''");
        query = `SELECT * FROM "${table}" t WHERE row_to_json(t)::text ILIKE '%${escaped}%' LIMIT ${safeLimit}`;
      } else {
        query = `SELECT * FROM "${table}" LIMIT ${safeLimit}`;
      }
      const data = await api.post<{ rows?: Array<Record<string, unknown>> }>("/admin/db-query", {
        query,
      });
      const rows = data?.rows ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
      setResult({ columns, rows });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table data");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (row: Record<string, unknown>) => {
    const json = JSON.stringify(row, null, 2);
    setEditOriginalRow(row);
    setEditJson(json);
    setOriginalJson(json);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handlePrepareSave = () => {
    try {
      JSON.parse(editJson);
    } catch {
      setEditError("Invalid JSON. Please fix the row data.");
      return;
    }
    setEditError(null);
    setIsConfirmOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTable || !editOriginalRow) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(editJson) as Record<string, unknown>;
      } catch {
        setEditError("Invalid JSON. Please fix the row data.");
        return;
      }
      const idValue = editOriginalRow.id ?? editOriginalRow.ID ?? editOriginalRow.Id;
      if (idValue === undefined || idValue === null) {
        setEditError("Cannot edit this row because no 'id' column was found.");
        return;
      }
      await api.post("/admin/db-row", {
        table: selectedTable,
        idColumn: "id",
        idValue,
        data: parsed,
      });
      setIsEditOpen(false);
      setEditOriginalRow(null);
      await loadTable(selectedTable, { limit: rowLimit });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update row");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRow = async (row: Record<string, unknown>) => {
    if (!selectedTable) return;
    const idValue = row.id ?? row.ID ?? row.Id;
    if (idValue === undefined || idValue === null) {
      setDeleteError("Cannot delete this row because no 'id' column was found.");
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.delete("/admin/db-row", {
        body: JSON.stringify({
          table: selectedTable,
          idColumn: "id",
          idValue,
        }),
      });
      await loadTable(selectedTable, { limit: rowLimit });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete row");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (!result) return [];
    if (!searchText.trim()) return result.rows;
    const needle = searchText.toLowerCase();
    return result.rows.filter((row) =>
      JSON.stringify(row).toLowerCase().includes(needle)
    );
  }, [result, searchText]);

  // Access: require admin or admin.db.view
  if (user?.role !== "ADMIN" && !canViewDb) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Database Explorer. Please contact an administrator.
        </p>
        <Button asChild variant="outline">
          <Link to={ROUTES.DASHBOARD}>Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const CARD_CLASS =
    "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${CARD_CLASS} p-6 sm:p-8 relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
              Database Explorer
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              Browse tables and inspect their contents. Select a table to view entries.
            </p>
          </div>
          {user?.email && (
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              Signed in as <span className="font-semibold">{user.email}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Tables list */}
        <div className={`lg:col-span-2 ${CARD_CLASS} overflow-hidden`}>
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Tables (public schema)
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Select a table and click <span className="font-semibold">View</span> to see its entries.
            </p>
          </div>
          {tablesLoading ? (
            <div className="p-8 text-center text-neutral-500 dark:text-neutral-400">Loading tables...</div>
          ) : tablesError ? (
            <div className="p-4 text-sm text-error-600 dark:text-error-400">{tablesError}</div>
          ) : tables.length === 0 ? (
            <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No tables found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Table name
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {tables.map((table) => {
                    const isActive = selectedTable === table;
                    return (
                      <tr
                        key={table}
                        className={
                          "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors " +
                          (isActive ? "bg-primary-50/60 dark:bg-primary-900/20" : "")
                        }
                      >
                        <td className="px-6 py-4 font-mono text-sm text-neutral-800 dark:text-neutral-100">
                          {table}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <Button
                            type="button"
                            variant={isActive ? "primary" : "outline"}
                            size="sm"
                            disabled={isLoading && isActive}
                            onClick={() => loadTable(table, { limit: rowLimit })}
                          >
                            {isActive && isLoading ? "Loading..." : "View"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Table data view */}
        <div className={`lg:col-span-3 ${CARD_CLASS} overflow-hidden`}>
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedTable ? `Entries in "${selectedTable}"` : "No table selected"}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Showing up to {rowLimit} rows. Use search and limit to refine.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <div>
                <label htmlFor="db-console-search" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Search
                </label>
                <input
                  id="db-console-search"
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Filter results in view"
                />
              </div>
              <div>
                <label htmlFor="db-console-limit" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Limit
                </label>
                <input
                  id="db-console-limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={rowLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const next = Number.isNaN(val) ? 100 : Math.min(Math.max(val, 1), 1000);
                    setRowLimit(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedTable || isLoading}
                  onClick={() => selectedTable && loadTable(selectedTable, { limit: rowLimit })}
                  className="w-full"
                >
                  Reload
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-error-50 dark:bg-error-900/20 text-sm text-error-700 dark:text-error-300">
              {error}
            </div>
          )}

          {!selectedTable ? (
            <div className="p-12 text-center">
              <p className="text-neutral-600 dark:text-neutral-400">
                Select a table on the left to view its entries.
              </p>
            </div>
          ) : !result ? (
            <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {isLoading ? "Loading data..." : "Click View to load data."}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-neutral-600 dark:text-neutral-400 mb-4">No rows match your filters.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchText("");
                  selectedTable && loadTable(selectedTable, { limit: rowLimit });
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                    {(canEditEntries || canDeleteEntries) && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider sticky right-0 z-10 bg-neutral-50 dark:bg-neutral-900">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredRows.map((row, idx) => (
                    <tr key={`row-${idx}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                      {result.columns.map((col) => (
                        <td
                          key={col}
                          className="px-6 py-4 whitespace-pre font-mono text-xs text-neutral-800 dark:text-neutral-100"
                        >
                          {formatCell((row as Record<string, unknown>)[col])}
                        </td>
                      ))}
                      {(canEditEntries || canDeleteEntries) && (
                        <td className="px-4 py-4 text-right whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-neutral-900">
                          <div className="inline-flex items-center gap-2">
                            {canEditEntries && (
                              <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(row as Record<string, unknown>)}>
                                Edit
                              </Button>
                            )}
                            {canDeleteEntries && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isDeleting}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Are you sure you want to delete this row? This action cannot be undone."
                                    )
                                  ) {
                                    void handleDeleteRow(row as Record<string, unknown>);
                                  }
                                }}
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Row Dialog */}
      {canEditEntries && (
        <Dialog
          open={isEditOpen}
          title="Edit Row"
          description={
            selectedTable
              ? `Edit JSON for the row in "${selectedTable}". Only rows with an "id" column are editable.`
              : "Edit row JSON."
          }
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) {
              setEditOriginalRow(null);
              setEditError(null);
            }
          }}
        >
          <div className="p-6 space-y-4">
            {editError && (
              <div className="p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-700 dark:text-error-300">
                {editError}
              </div>
            )}
            <textarea
              className="w-full h-64 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              value={editJson}
              onChange={(e) => setEditJson(e.target.value)}
              spellCheck={false}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Changes are applied directly to the database. Double-check before saving.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditOriginalRow(null);
                    setEditError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handlePrepareSave} disabled={isSavingEdit}>
                  {isSavingEdit ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Confirm Save Dialog */}
      {canEditEntries && (
        <Dialog
          open={isConfirmOpen}
          onOpenChange={setIsConfirmOpen}
          title="Confirm Changes"
          description="Are you sure you want to apply these changes to this row?"
        >
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Old version</p>
              <div className="w-full max-h-40 overflow-auto px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono whitespace-pre">
                <DiffLines oldText={originalJson} newText={editJson} mode="old" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">New version</p>
              <div className="w-full max-h-40 overflow-auto px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono whitespace-pre">
                <DiffLines oldText={originalJson} newText={editJson} mode="new" />
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Apply the new version to the database?
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSavingEdit}
                onClick={async () => {
                  setIsConfirmOpen(false);
                  await handleSaveEdit();
                }}
              >
                {isSavingEdit ? "Saving..." : "Yes, apply changes"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {deleteError && (
        <div className="p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-700 dark:text-error-300">
          {deleteError}
        </div>
      )}
    </div>
  );
}
