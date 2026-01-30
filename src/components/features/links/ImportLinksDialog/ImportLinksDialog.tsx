"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { importLinks } from "@/server/actions/links";

interface ImportLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCollectionId?: string;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

export function ImportLinksDialog({
  open,
  onOpenChange,
  selectedCollectionId,
}: ImportLinksDialogProps) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; url?: string; error: string }>;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setSkipDuplicates(true);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setResult(null);
    setIsSubmitting(true);
    try {
      const content = await file.text();
      const res = await importLinks(content, {
        format,
        collectionId: selectedCollectionId,
        skipDuplicates,
      });
      if (res.success && res.data) {
        setResult(res.data);
        if (res.data.imported > 0) {
          router.refresh();
        }
      } else {
        setError(!res.success ? res.error : "Import failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Import links">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Upload a JSON or CSV file exported from this app (or with the same structure). One link per row; <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 rounded">url</code> is required.
        </p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileChange}
            disabled={isSubmitting}
            className="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-neutral-100 file:text-neutral-700 dark:file:bg-neutral-800 dark:file:text-neutral-300"
          />
          {file && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {file.name}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            disabled={isSubmitting}
            className="rounded border-neutral-300 dark:border-neutral-600"
          />
          Skip duplicate URLs (already saved)
        </label>
        {selectedCollectionId && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Imported links will be added to the selected collection.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3 text-sm space-y-2">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              Imported {result.imported} link{result.imported !== 1 ? "s" : ""}.
              {result.skipped > 0 && ` Skipped ${result.skipped} duplicate(s).`}
              {result.errors.length > 0 && ` ${result.errors.length} error(s).`}
            </p>
            {result.errors.length > 0 && result.errors.length <= 20 && (
              <ul className="max-h-32 overflow-y-auto space-y-1 text-neutral-600 dark:text-neutral-400 text-xs">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}{e.url ? ` (${e.url})` : ""}: {e.error}
                  </li>
                ))}
              </ul>
            )}
            {result.errors.length > 20 && (
              <p className="text-xs text-neutral-500">First 20 errors shown.</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button type="submit" variant="primary" disabled={isSubmitting || !file}>
              {isSubmitting ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
