"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { exportSelectedLinks } from "@/server/actions/links";

type BulkExportLinkItem = {
  id: string;
  title: string;
  url: string;
  collections: Array<{
    collection: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

interface BulkExportLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: BulkExportLinkItem[];
}

export function BulkExportLinksDialog({
  open,
  onOpenChange,
  links,
}: BulkExportLinksDialogProps) {
  const [includeCollections, setIncludeCollections] = React.useState(true);
  const [format, setFormat] = React.useState<"json" | "csv">("json");
  const [exporting, setExporting] = React.useState<"json" | "csv" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setIncludeCollections(true);
      setFormat("json");
      setExporting(null);
      setError(null);
    }
  }, [open]);

  const handleExport = async () => {
    if (!links.length || exporting) return;
    setExporting(format);
    setError(null);
    try {
      const result = await exportSelectedLinks(
        links.map((l) => l.id),
        format,
        { includeCollections }
      );
      if (result.success && result.data) {
        const blob = new Blob([result.data.content], { type: result.data.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.data.filename;
        a.click();
        URL.revokeObjectURL(url);
        onOpenChange(false);
      } else if (!result.success) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const count = links.length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export selected links"
      description={
        count > 0
          ? `You have selected ${count} link${count !== 1 ? "s" : ""}. Review export settings and download your file.`
          : "No links selected to export."
      }
    >
      <div className="px-4 sm:px-6 pb-6 space-y-4">
        {/* Export settings */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 p-3 space-y-3">
          {/* Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Export summary
              </p>
              <p className="text-sm text-neutral-800 dark:text-neutral-100">
                {count > 0 ? `${count} link${count !== 1 ? "s" : ""} selected` : "No links selected"}
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
                Dates are exported in ISO-8601 (UTC). CSV uses UTF-8 encoding with a header row.
              </p>
            </div>
          </div>
        </div>

        {links.length > 0 && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden max-h-48 overflow-y-auto">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
              {links.map((link) => (
                <li key={link.id} className="px-3 py-2">
                  <div className="truncate font-medium text-neutral-900 dark:text-neutral-100 max-w-[260px]">
                    {link.title || link.url}
                  </div>
                  <div className="truncate text-xs text-neutral-500 dark:text-neutral-400 max-w-[260px]">
                    {link.url}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleExport}
            disabled={!links.length || exporting !== null}
          >
            {exporting
              ? `Exporting ${exporting}…`
              : count > 0
              ? `Export ${count} link${count !== 1 ? "s" : ""}`
              : "Export"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

