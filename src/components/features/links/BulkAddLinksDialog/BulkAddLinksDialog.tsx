"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { bulkCreateLinks } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";

interface BulkAddLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCollectionId?: string;
  collections?: Array<{ id: string; name: string; color: string | null }>;
}

export function BulkAddLinksDialog({
  open,
  onOpenChange,
  selectedCollectionId,
  collections = [],
}: BulkAddLinksDialogProps) {
  const router = useRouter();
  const [urlsText, setUrlsText] = React.useState("");
  const [extractMetadata, setExtractMetadata] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ created: number; failed: Array<{ url: string; error: string }> } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setUrlsText("");
      setExtractMetadata(true);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const collectionIds = selectedCollectionId ? [selectedCollectionId] : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const lines = urlsText
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("Please enter at least one URL (one per line).");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await bulkCreateLinks(lines, {
        collectionIds,
        extractMetadata,
      });
      if (res.success && res.data) {
        setResult(res.data);
        if (res.data.created > 0) {
          router.refresh();
        }
      } else {
        setError(!res.success ? res.error : "Bulk add failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCount = urlsText
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const formatted = formatLinkUrl(line);
      return validateUrl(formatted);
    }).length;
  const totalLines = urlsText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Bulk add links">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Paste one URL per line. Invalid lines are skipped. Duplicates are not created.
        </p>
        <Textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={"https://example.com\nhttps://github.com/owner/repo\n..."}
          rows={10}
          className="font-mono text-sm"
          disabled={isSubmitting}
        />
        {totalLines > 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {validCount} valid URL{validCount !== 1 ? "s" : ""} of {totalLines} line{totalLines !== 1 ? "s" : ""}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extractMetadata}
            onChange={(e) => setExtractMetadata(e.target.checked)}
            disabled={isSubmitting}
            className="rounded border-neutral-300 dark:border-neutral-600"
          />
          Extract title and description from each page
        </label>
        {selectedCollectionId && collections.length > 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Links will be added to the selected collection.
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
              Created {result.created} link{result.created !== 1 ? "s" : ""}.
              {result.failed.length > 0 &&
                ` ${result.failed.length} failed.`}
            </p>
            {result.failed.length > 0 && (
              <ul className="max-h-32 overflow-y-auto space-y-1 text-neutral-600 dark:text-neutral-400">
                {result.failed.slice(0, 20).map((f, i) => (
                  <li key={i} className="truncate" title={f.url}>
                    <span className="font-mono text-xs">{f.url}</span>: {f.error}
                  </li>
                ))}
                {result.failed.length > 20 && (
                  <li className="text-xs">… and {result.failed.length - 20} more</li>
                )}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button type="submit" variant="primary" disabled={isSubmitting || validCount === 0}>
              {isSubmitting ? "Adding…" : `Add ${validCount} link${validCount !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
