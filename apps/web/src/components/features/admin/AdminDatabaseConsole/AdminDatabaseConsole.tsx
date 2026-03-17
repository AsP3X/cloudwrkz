"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { CurrentUser } from "@/lib/utils/auth-server";

type RowsResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

interface AdminDatabaseConsolePageProps {
  user: CurrentUser;
  tables: string[];
  canEditEntries?: boolean;
  canDeleteEntries?: boolean;
}

export function AdminDatabaseConsolePage({
  user,
  tables,
  canEditEntries = false,
  canDeleteEntries = false,
}: AdminDatabaseConsolePageProps) {
  const [selectedTable, setSelectedTable] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RowsResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchText, setSearchText] = React.useState<string>("");
  const [rowLimit, setRowLimit] = React.useState<number>(100);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editRowIndex, setEditRowIndex] = React.useState<number | null>(null);
  const [editJson, setEditJson] = React.useState<string>("");
  const [originalJson, setOriginalJson] = React.useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  const loadTable = async (table: string, opts?: { search?: string; limit?: number }) => {
    setSelectedTable(table);
    setError(null);
    setIsLoading(true);

    try {
      const safeLimit = opts?.limit && opts.limit > 0 ? opts.limit : 100;
      const search = opts?.search?.trim();

      let query = `SELECT * FROM "${table}"`;
      if (search) {
        const escaped = search.replace(/'/g, "''");
        query = `SELECT * FROM "${table}" t WHERE row_to_json(t)::text ILIKE '%${escaped}%'`;
      }
      query += ` LIMIT ${safeLimit};`;

      const response = await fetch("/api/admin/db-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to load table data");
        setResult(null);
        return;
      }

      // db-query returns { type: "rows", columns, rows }
      const rowsResult: RowsResult = {
        columns: data.columns || [],
        rows: data.rows || [],
      };

      setResult(rowsResult);
    } catch (err: any) {
      setError(err.message || "Failed to load table data");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditDialog = (rowIndex: number) => {
    if (!result) return;
    setEditRowIndex(rowIndex);
    const row = result.rows[rowIndex];
    const json = JSON.stringify(row, null, 2);
    setEditJson(json);
    setOriginalJson(json);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handlePrepareSave = () => {
    // Validate JSON before showing confirmation dialog
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
    if (!result || selectedTable == null || editRowIndex == null) return;

    setIsSavingEdit(true);
    setEditError(null);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(editJson);
      } catch {
        setEditError("Invalid JSON. Please fix the row data.");
        return;
      }

      const originalRow = result.rows[editRowIndex] as any;
      const idValue = originalRow.id ?? originalRow.ID ?? originalRow.Id;
      if (idValue === undefined || idValue === null) {
        setEditError("Cannot edit this row because no 'id' column was found.");
        return;
      }

      const response = await fetch("/api/admin/db-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: selectedTable,
          idColumn: "id",
          idValue,
          data: parsed,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setEditError(data.error || "Failed to update row");
        return;
      }

      setIsEditOpen(false);
      setEditRowIndex(null);
      await loadTable(selectedTable, { limit: rowLimit });
    } catch (err: any) {
      setEditError(err.message || "Failed to update row");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRow = async (rowIndex: number) => {
    if (!result || selectedTable == null) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const row = result.rows[rowIndex] as any;
      const idValue = row.id ?? row.ID ?? row.Id;
      if (idValue === undefined || idValue === null) {
        setDeleteError("Cannot delete this row because no 'id' column was found.");
        return;
      }

      const response = await fetch("/api/admin/db-row", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: selectedTable,
          idColumn: "id",
          idValue,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setDeleteError(data.error || "Failed to delete row");
        return;
      }

      await loadTable(selectedTable, { limit: rowLimit });
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete row");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRows = React.useMemo(() => {
    if (!result) return [];
    if (!searchText.trim()) return result.rows;
    const needle = searchText.toLowerCase();
    return result.rows.filter((row) =>
      JSON.stringify(row)
        .toLowerCase()
        .includes(needle)
    );
  }, [result, searchText]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/60 dark:border-neutral-800/60 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
              Database Explorer
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              Browse tables and inspect their contents in a safe, read-only view.
            </p>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
        </div>
      </div>

      {/* Explorer layout: tables list + table data */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Tables list */}
        <div className="lg:col-span-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Tables (public schema)
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Select a table and click <span className="font-semibold">View</span> to see its entries.
            </p>
          </div>

          {/* Tables Content */}
          {tables.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No tables found.</p>
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
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-neutral-800 dark:text-neutral-100">
                            {table}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={isLoading && isActive}
                            onClick={() => loadTable(table, { limit: rowLimit })}
                            className={`
                              inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                              transition-all duration-200
                              ${
                                isActive
                                  ? "bg-primary-600 text-white shadow-sm hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
                                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                              }
                              disabled:opacity-50 disabled:cursor-not-allowed
                              focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900
                            `}
                          >
                            {isActive && isLoading ? (
                              <>
                                <svg
                                  className="w-4 h-4 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                <span>Loading...</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                                <span>View</span>
                              </>
                            )}
                          </button>
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
        <div className="lg:col-span-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
          {/* Menu Bar */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedTable ? `Entries in "${selectedTable}"` : "No table selected"}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Showing up to {rowLimit} rows. Use the search and limit controls to refine what you see.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="db-console-search" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  id="db-console-search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Filter results in view"
                />
              </div>
              <div>
                <label htmlFor="db-console-limit" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  id="db-console-limit"
                  value={rowLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const next = Number.isNaN(val) ? 100 : Math.min(Math.max(val, 1), 1000);
                    setRowLimit(next);
                  }}
                  className="w-full px-3 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedTable || isLoading}
                  onClick={() => {
                    if (!selectedTable) return;
                    loadTable(selectedTable, { limit: rowLimit });
                  }}
                  className="w-full"
                >
                  Reload
                </Button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-error-50 dark:bg-error-900/20">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Table Content */}
          {!selectedTable ? (
            <div className="p-12 text-center">
              <svg
                className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                />
              </svg>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                No table selected
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Select a table on the left to view its entries.
              </p>
            </div>
          ) : !result ? (
            <div className="p-12 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {isLoading ? "Loading data..." : "No data loaded yet for this table."}
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center">
              <svg
                className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                No rows found
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                No rows match your current filters.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchText("");
                  if (selectedTable) {
                    loadTable(selectedTable, { limit: rowLimit });
                  }
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
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
                      <th
                        className="
                          px-4 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider
                          sticky right-0 z-10
                          bg-neutral-50 dark:bg-neutral-900
                          shadow-[inset_1px_0_0_rgba(226,232,240,1)] dark:shadow-[inset_1px_0_0_rgba(31,41,55,1)]
                        "
                      >
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={`row-${idx}`}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {result.columns.map((col) => (
                        <td
                          key={col}
                          className="px-6 py-4 whitespace-pre text-neutral-800 dark:text-neutral-100 font-mono text-xs"
                        >
                          {formatCell((row as any)[col])}
                        </td>
                      ))}
                      {(canEditEntries || canDeleteEntries) && (
                        <td
                          className="
                            px-4 py-4 text-right whitespace-nowrap
                            sticky right-0 z-10
                            bg-white dark:bg-neutral-900
                            shadow-[inset_1px_0_0_rgba(226,232,240,1)] dark:shadow-[inset_1px_0_0_rgba(31,41,55,1)]
                          "
                        >
                          <div className="inline-flex items-center gap-2">
                            {canEditEntries && (
                              <button
                                type="button"
                                onClick={() => openEditDialog(idx)}
                                className="
                                  inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                                  transition-all duration-200
                                  bg-neutral-100 text-neutral-700 hover:bg-neutral-200
                                  dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700
                                  disabled:opacity-50 disabled:cursor-not-allowed
                                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900
                                "
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteEntries && (
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Are you sure you want to delete this row? This action cannot be undone.",
                                    )
                                  ) {
                                    void handleDeleteRow(idx);
                                  }
                                }}
                                className="
                                  inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                                  transition-all duration-200
                                  bg-neutral-100 text-neutral-700 hover:bg-neutral-200
                                  dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700
                                  disabled:opacity-50 disabled:cursor-not-allowed
                                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900
                                "
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
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
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) {
              setEditRowIndex(null);
              setEditError(null);
            }
          }}
          title="Edit Row"
          description={
            selectedTable
              ? `Edit JSON representation of the row in "${selectedTable}". Only tables with an "id" column are editable.`
              : "Edit JSON representation of the row."
          }
        >
          <div className="p-6 space-y-4">
            {editError && (
              <div className="p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-700 dark:text-error-300">
                {editError}
              </div>
            )}
            <textarea
              className="w-full h-64 px-3 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              value={editJson}
              onChange={(e) => setEditJson(e.target.value)}
              spellCheck={false}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Changes are applied directly to the database. Please double-check before saving.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditRowIndex(null);
                    setEditError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handlePrepareSave}
                  disabled={isSavingEdit}
                >
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
          onOpenChange={(open) => {
            setIsConfirmOpen(open);
          }}
          title="Confirm Changes"
          description="Are you sure you want to apply the following changes to this row?"
        >
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Old version
              </p>
              <div className="w-full max-h-40 overflow-auto px-3 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-neutral-100 whitespace-pre">
                <DiffLines oldText={originalJson} newText={editJson} mode="old" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                New version
              </p>
              <div className="w-full max-h-40 overflow-auto px-3 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs font-mono text-neutral-900 dark:text-neutral-100 whitespace-pre">
                <DiffLines oldText={originalJson} newText={editJson} mode="new" />
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Are you sure you want to change the old version into the new version shown above?
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConfirmOpen(false)}
              >
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

      {/* Delete error banner */}
      {deleteError && (
        <div className="mt-4 p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 text-sm text-error-700 dark:text-error-300">
          {deleteError}
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
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

function DiffLines({ oldText, newText, mode }: { oldText: string; newText: string; mode: DiffMode }) {
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
      </div>,
    );
  }

  return <>{elements}</>;
}

