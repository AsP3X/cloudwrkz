"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { getLinks, exportSelectedLinks, type LinkFilters } from "@/server/actions/links";
import { LINK_PAGE_SIZE_ALL } from "@/lib/constants/links";
import { cn } from "@/lib/utils/cn";

type ExportLinkItem = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  linkType: string;
  tags: string[];
  notes: string | null;
  isFavorite: boolean;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
  collections: Array<{
    collection: { id: string; name: string; color: string | null };
  }>;
};

interface ExportLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filters for the current view (e.g. collectionId from URL). Used to load links for selection. */
  filters?: Partial<LinkFilters>;
  /** Optional human-readable context for the current view (e.g. collection name). */
  contextLabel?: string;
}

const EMPTY_FILTERS: Partial<LinkFilters> = {};

export function ExportLinksDialog({
  open,
  onOpenChange,
  filters = EMPTY_FILTERS,
  contextLabel,
}: ExportLinksDialogProps) {
  const [links, setLinks] = React.useState<ExportLinkItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState<"json" | "csv" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [includeCollections, setIncludeCollections] = React.useState(true);
  const [format, setFormat] = React.useState<"json" | "csv">("json");

  const loadLinks = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLinks({
        ...filters,
        archived: filters.archived ?? false,
        page: 1,
        limit: LINK_PAGE_SIZE_ALL,
        sortBy: filters.sortBy ?? "createdAt",
        sortOrder: filters.sortOrder ?? "desc",
      });
      setLinks(result.links as ExportLinkItem[]);
      setSelectedIds(new Set(result.links.map((l) => l.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load links");
      setLinks([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    if (open) {
      loadLinks();
    }
  }, [open, loadLinks]);

  React.useEffect(() => {
    if (!open) {
      setLinks([]);
      setSelectedIds(new Set());
      setError(null);
      setIncludeCollections(true);
      setFormat("json");
    }
  }, [open]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(links.map((l) => l.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const selectedCount = selectedIds.size;
  const allSelected = links.length > 0 && selectedCount === links.length;
  const someSelected = selectedCount > 0;
  const hasAny = links.length > 0;

  const handleExport = async () => {
    if (selectedCount === 0) return;
    setExporting(format);
    try {
      const result = await exportSelectedLinks(Array.from(selectedIds), format, {
        includeCollections,
      });
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: result.data.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
        onOpenChange(false);
      } else {
        setError(result.success ? null : result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Export links">
      <div className="px-4 sm:px-6 pb-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Choose which links to export from{" "}
            <span className="font-medium">
              {contextLabel || "this view"}
            </span>
            , adjust settings, then download a file you can use in spreadsheets or other tools.
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Dates are exported in ISO-8601 (UTC). CSV uses UTF-8 encoding with a header row.
          </p>
        </div>

        {/* Export settings */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 p-3 space-y-3">
          {/* Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Export summary
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-100">
                {loading
                  ? "Loading links…"
                  : hasAny
                  ? `${selectedCount} of ${links.length} link${links.length !== 1 ? "s" : ""} selected`
                  : "No links available in this view"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <span>
                Format:{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-100 uppercase">
                  {format}
                </span>
              </span>
              <span>
                Collections:{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-100">
                  {includeCollections ? "included" : "excluded"}
                </span>
              </span>
            </div>
          </div>

          {/* Include collections */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCollections}
              onChange={(e) => setIncludeCollections(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Include collections in export
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                When enabled, exported rows include the names (and colors for JSON) of each link&apos;s collections.
              </p>
            </div>
          </label>

          {/* Format */}
          <div>
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mr-2">
              Format
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setFormat("json")}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md",
                    format === "json"
                      ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  )}
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("csv")}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md",
                    format === "csv"
                      ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  )}
                >
                  CSV
                </button>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                JSON is best for re-importing or APIs; CSV is ideal for spreadsheets and BI tools.
              </p>
            </div>
          </div>
        </div>

        {/* Links list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Links ({selectedCount} selected)
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          {loading ? (
            <div
              className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400"
              aria-busy="true"
            >
              Loading links…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : links.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-4">
              No links to export in this view.
            </p>
          ) : (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-800 sticky top-0">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !allSelected;
                        }}
                        onChange={() => (allSelected ? deselectAll() : selectAll())}
                        className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
                        aria-label="Toggle all"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Link
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-400 hidden sm:table-cell">
                      Collections
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(link.id)}
                          onChange={() => toggleOne(link.id)}
                          className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
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
                        {link.collections?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {link.collections.map((c) => (
                              <span
                                key={c.collection.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                                style={
                                  c.collection.color
                                    ? {
                                        backgroundColor: `${c.collection.color}20`,
                                        color: c.collection.color,
                                      }
                                    : undefined
                                }
                              >
                                {c.collection.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleExport}
            disabled={loading || selectedCount === 0 || exporting !== null}
          >
            {exporting
              ? `Exporting ${exporting}…`
              : `Export ${selectedCount} link${selectedCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
