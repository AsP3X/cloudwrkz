"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  importLinks,
  previewImportLinks,
  type ImportPreviewLink,
  type ImportPreviewResult,
} from "@/server/actions/links";
import { getUserCollections } from "@/server/actions/collections";
import { cn } from "@/lib/utils/cn";

// ── Types ──────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "importing" | "results";

type CollectionMappingAction = "create" | "map" | "skip";
type CollectionMappingEntry = {
  action: CollectionMappingAction;
  targetId?: string;
};

interface ImportLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCollectionId?: string;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

// ── Component ──────────────────────────────────────────────────────────

export function ImportLinksDialog({
  open,
  onOpenChange,
  selectedCollectionId,
}: ImportLinksDialogProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = React.useState<Step>("upload");

  // Upload step
  const [file, setFile] = React.useState<File | null>(null);
  const [fileContent, setFileContent] = React.useState<string>("");
  const [fileFormat, setFileFormat] = React.useState<"json" | "csv" | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);

  // Preview step
  const [preview, setPreview] = React.useState<ImportPreviewResult | null>(null);
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
  const [collectionMapping, setCollectionMapping] = React.useState<
    Record<string, CollectionMappingEntry>
  >({});
  const [userCollections, setUserCollections] = React.useState<
    Array<{ id: string; name: string; color: string | null }>
  >([]);
  const [loadingCollections, setLoadingCollections] = React.useState(false);

  // Results step
  const [importResult, setImportResult] = React.useState<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; url?: string; error: string }>;
  } | null>(null);

  // Shared
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Reset on close ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setStep("upload");
      setFile(null);
      setFileContent("");
      setFileFormat(null);
      setPreview(null);
      setSelectedRows(new Set());
      setCollectionMapping({});
      setUserCollections([]);
      setImportResult(null);
      setError(null);
      setIsLoadingPreview(false);
      setLoadingCollections(false);
    }
  }, [open]);

  // ── Upload step handlers ───────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) {
      setError("Please select a JSON or CSV file.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    const format = ext === "csv" ? "csv" : ext === "json" ? "json" : null;
    if (!format) {
      setError("File must be .json or .csv");
      return;
    }
    setError(null);
    setIsLoadingPreview(true);
    setFileFormat(format);
    try {
      const content = await file.text();
      setFileContent(content);
      const res = await previewImportLinks(content, format);
      if (res.success && res.data) {
        setPreview(res.data);
        // Auto-select all new (non-duplicate, non-error) rows
        const newRows = new Set(
          res.data.links
            .filter((l) => !l.isDuplicate && !l.validationError)
            .map((l) => l.rowIndex)
        );
        setSelectedRows(newRows);
        // Initialize collection mapping: default all to "create"
        const mapping: Record<string, CollectionMappingEntry> = {};
        for (const c of res.data.sourceCollectionNames) {
          mapping[c.name] = { action: "create" };
        }
        setCollectionMapping(mapping);
        // Load user collections for mapping dropdowns
        setLoadingCollections(true);
        getUserCollections("")
          .then((cols) => setUserCollections(cols))
          .catch(() => {})
          .finally(() => setLoadingCollections(false));

        setStep("preview");
      } else {
        setError(!res.success ? res.error : "Failed to parse file");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ── Preview step handlers ──────────────────────────────────────────
  const handleToggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const handleSelectAllNew = () => {
    if (!preview) return;
    const newRows = preview.links
      .filter((l) => !l.isDuplicate && !l.validationError)
      .map((l) => l.rowIndex);
    setSelectedRows(new Set(newRows));
  };

  const handleDeselectAll = () => {
    setSelectedRows(new Set());
  };

  const handleMappingChange = (
    sourceName: string,
    action: CollectionMappingAction,
    targetId?: string
  ) => {
    setCollectionMapping((prev) => ({
      ...prev,
      [sourceName]: { action, targetId },
    }));
  };

  const importableCount = preview
    ? preview.links.filter(
        (l) => selectedRows.has(l.rowIndex) && !l.validationError
      ).length
    : 0;

  // ── Import handler ─────────────────────────────────────────────────
  const handleImport = async () => {
    if (!fileContent || !fileFormat || !preview) return;
    setStep("importing");
    setError(null);
    try {
      // Build collection mapping for server: source name (lowercase) → target ID or null
      const serverMapping: Record<string, string | null> = {};
      for (const [sourceName, entry] of Object.entries(collectionMapping)) {
        const key = sourceName.trim().toLowerCase();
        if (entry.action === "skip") {
          serverMapping[key] = null;
        } else if (entry.action === "map" && entry.targetId) {
          serverMapping[key] = entry.targetId;
        }
        // "create" = default behavior, don't include in mapping
      }

      const rowIndices = Array.from(selectedRows);

      const res = await importLinks(fileContent, {
        format: fileFormat,
        collectionId: selectedCollectionId,
        skipDuplicates: true,
        collectionMapping:
          Object.keys(serverMapping).length > 0 ? serverMapping : undefined,
        rowIndicesToImport: rowIndices,
      });

      if (res.success && res.data) {
        setImportResult(res.data);
        setStep("results");
        if (res.data.imported > 0) {
          router.refresh();
        }
      } else {
        setError(!res.success ? res.error : "Import failed");
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("preview");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const titleMap: Record<Step, string> = {
    upload: "Import links",
    preview: "Review import",
    importing: "Importing…",
    results: "Import complete",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={step === "importing" ? undefined : onOpenChange}
      title={titleMap[step]}
    >
      <div className="px-4 sm:px-6 pb-6 space-y-4">
        {/* ── Upload Step ────────────────────────────────────────── */}
        {step === "upload" && (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Upload a JSON or CSV file exported from this app. You&apos;ll be able
              to review and configure collections before importing.
            </p>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileChange}
                disabled={isLoadingPreview}
                className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-neutral-100 file:text-neutral-700 dark:file:bg-neutral-800 dark:file:text-neutral-300"
              />
              {file && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {file.name}
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoadingPreview}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handlePreview}
                disabled={isLoadingPreview || !file}
              >
                {isLoadingPreview ? "Analyzing…" : "Preview"}
              </Button>
            </div>
          </>
        )}

        {/* ── Preview Step ───────────────────────────────────────── */}
        {step === "preview" && preview && (
          <>
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {preview.totalCount} total
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300">
                {preview.newCount} new
              </span>
              {preview.duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {preview.duplicateCount} duplicate{preview.duplicateCount !== 1 ? "s" : ""}
                </span>
              )}
              {preview.errorCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-900/30 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300">
                  {preview.errorCount} error{preview.errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Collection mapping */}
            {preview.sourceCollectionNames.length > 0 && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Collection mapping
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Choose what happens to each collection from the export file.
                </p>
                <div className="space-y-2">
                  {preview.sourceCollectionNames.map((sc) => {
                    const entry = collectionMapping[sc.name] ?? { action: "create" as const };
                    return (
                      <div
                        key={sc.name}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {sc.color && (
                            <span
                              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: sc.color }}
                            />
                          )}
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {sc.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select
                            value={entry.action}
                            onChange={(e) => {
                              const action = e.target.value as CollectionMappingAction;
                              handleMappingChange(sc.name, action, undefined);
                            }}
                            className="text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="create">Create new</option>
                            {userCollections.length > 0 && (
                              <option value="map">Map to existing</option>
                            )}
                            <option value="skip">Skip</option>
                          </select>
                          {entry.action === "map" && (
                            <select
                              value={entry.targetId ?? ""}
                              onChange={(e) =>
                                handleMappingChange(sc.name, "map", e.target.value || undefined)
                              }
                              className="text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[180px]"
                            >
                              <option value="">Select…</option>
                              {userCollections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {loadingCollections && (
                  <p className="text-xs text-neutral-400">Loading your collections…</p>
                )}
              </div>
            )}

            {/* Links table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Links ({importableCount} selected)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllNew}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Select all new
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2 text-left"></th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        Link
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                        Collections
                      </th>
                      <th className="w-24 px-3 py-2 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {preview.links.map((link) => {
                      const isError = !!link.validationError;
                      const isDup = link.isDuplicate;
                      const isNew = !isError && !isDup;
                      const isChecked = selectedRows.has(link.rowIndex);
                      const canSelect = !isError;

                      return (
                        <tr
                          key={link.rowIndex}
                          className={cn(
                            "transition-colors",
                            isError && "bg-red-50/50 dark:bg-red-950/20",
                            isDup && !isChecked && "opacity-60"
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!canSelect}
                              onChange={() => handleToggleRow(link.rowIndex)}
                              className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500 disabled:opacity-30"
                            />
                          </td>
                          <td className="px-3 py-2 min-w-0">
                            <div className="truncate font-medium text-neutral-900 dark:text-neutral-100 max-w-[240px]">
                              {link.title || link.url}
                            </div>
                            <div className="truncate text-xs text-neutral-500 dark:text-neutral-400 max-w-[240px]">
                              {link.url}
                            </div>
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            {link.collections.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {link.collections.map((c) => (
                                  <span
                                    key={c.name}
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                                    style={
                                      c.color
                                        ? {
                                            backgroundColor: `${c.color}20`,
                                            color: c.color,
                                          }
                                        : undefined
                                    }
                                  >
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isError ? (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                title={link.validationError ?? ""}
                              >
                                Error
                              </span>
                            ) : isDup ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                Duplicate
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                                New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setPreview(null);
                  setError(null);
                }}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleImport}
                  disabled={importableCount === 0}
                >
                  Import {importableCount} link{importableCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Importing Step ─────────────────────────────────────── */}
        {step === "importing" && (
          <div className="py-8 text-center space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-neutral-300 dark:border-neutral-600 border-t-primary-600 dark:border-t-primary-400" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Importing {importableCount} link{importableCount !== 1 ? "s" : ""}…
            </p>
          </div>
        )}

        {/* ── Results Step ───────────────────────────────────────── */}
        {step === "results" && importResult && (
          <>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
              {/* Success / summary */}
              <div className="flex flex-wrap gap-3">
                {importResult.imported > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {importResult.imported} imported
                    </span>
                  </div>
                )}
                {importResult.skipped > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                      <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {importResult.skipped} skipped (duplicates)
                    </span>
                  </div>
                )}
                {importResult.errors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                      <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Error details */}
              {importResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Error details:
                  </p>
                  <ul className="max-h-32 overflow-y-auto space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {importResult.errors.slice(0, 20).map((e) => (
                      <li key={e.row} className="flex gap-1">
                        <span className="text-red-500 flex-shrink-0">Row {e.row}</span>
                        {e.url && (
                          <span className="truncate text-neutral-500">({e.url})</span>
                        )}
                        <span>: {e.error}</span>
                      </li>
                    ))}
                  </ul>
                  {importResult.errors.length > 20 && (
                    <p className="text-xs text-neutral-400 mt-1">
                      Showing first 20 of {importResult.errors.length} errors.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
