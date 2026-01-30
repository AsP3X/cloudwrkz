"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { createLink } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";

type LinkProgressStatus = "pending" | "adding" | "added" | "failed";

interface LinkProgressItem {
  url: string;
  status: LinkProgressStatus;
  error?: string;
}

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
  const [linkProgress, setLinkProgress] = React.useState<LinkProgressItem[]>([]);
  const [result, setResult] = React.useState<{ created: number; failed: Array<{ url: string; error: string }> } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setUrlsText("");
      setExtractMetadata(true);
      setLinkProgress([]);
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
    const validUrls = lines
      .map((line) => formatLinkUrl(line))
      .filter((url) => validateUrl(url));
    if (validUrls.length === 0) {
      setError("No valid URLs to add. Please enter at least one valid URL.");
      return;
    }
    setLinkProgress(validUrls.map((url) => ({ url, status: "pending" as const })));
    setIsSubmitting(true);
    const failed: Array<{ url: string; error: string }> = [];
    let created = 0;
    try {
      for (let i = 0; i < validUrls.length; i++) {
        const url = validUrls[i];
        setLinkProgress((prev) =>
          prev.map((p, j) => (j === i ? { ...p, status: "adding" as const } : p))
        );
        const res = await createLink({
          url,
          collectionIds,
          extractMetadata,
          allowDuplicates: false,
        });
        if (res.success) {
          created++;
          setLinkProgress((prev) =>
            prev.map((p, j) => (j === i ? { ...p, status: "added" as const } : p))
          );
        } else {
          const errMsg = res.error ?? "Failed to create link";
          failed.push({ url, error: errMsg });
          setLinkProgress((prev) =>
            prev.map((p, j) =>
              j === i ? { ...p, status: "failed" as const, error: errMsg } : p
            )
          );
        }
      }
      setResult({ created, failed });
      if (created > 0) {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk add failed");
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
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk add links"
      description="Paste multiple URLs to add many links at once"
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-6">
        {error && (
          <div className="mb-6 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
            <p className="text-sm font-medium text-error-800 dark:text-error-200" role="alert">{error}</p>
          </div>
        )}

        {linkProgress.length === 0 ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  URLs
                </h3>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Paste one URL per line. Invalid lines are skipped. Duplicates are not created.
              </p>
              <div>
                <label htmlFor="bulk-urls" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  URLs (one per line)
                </label>
                <Textarea
                  id="bulk-urls"
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  placeholder={"https://example.com\nhttps://github.com/owner/repo\n..."}
                  rows={10}
                  className="font-mono text-sm resize-none"
                  disabled={isSubmitting}
                />
                {totalLines > 0 && (
                  <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {validCount} valid URL{validCount !== 1 ? "s" : ""} of {totalLines} line{totalLines !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  Options
                </h3>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={extractMetadata}
                  onChange={(e) => setExtractMetadata(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-neutral-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500"
                />
                Extract title and description from each page
              </label>
              {selectedCollectionId && collections.length > 0 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Links will be added to the selected collection.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Progress
              </h3>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto space-y-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3">
              {linkProgress.map((item, i) => (
                <li
                  key={`${item.url}-${i}`}
                  className="flex items-center gap-3 text-sm min-w-0"
                >
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center" aria-hidden>
                    {item.status === "pending" && (
                      <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                    )}
                    {item.status === "adding" && (
                      <svg
                        className="animate-spin h-4 w-4 text-primary-600 dark:text-primary-400"
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
                    )}
                    {item.status === "added" && (
                      <svg
                        className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {item.status === "failed" && (
                      <svg
                        className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                  <span className="font-mono text-xs text-neutral-600 dark:text-neutral-400 truncate min-w-0" title={item.url}>
                    {item.url}
                  </span>
                  <span
                    className="flex-shrink-0 text-xs text-neutral-500 dark:text-neutral-400 max-w-[40%] truncate"
                    title={item.status === "failed" && item.error ? item.error : undefined}
                  >
                    {item.status === "pending" && "Pending"}
                    {item.status === "adding" &&
                      (extractMetadata ? "Extracting metadata…" : "Adding…")}
                    {item.status === "added" && "Added"}
                    {item.status === "failed" && (item.error ? `Failed: ${item.error}` : "Failed")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {linkProgress.length > 0 && result && (
          <div className="mt-6 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4 text-sm space-y-2">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              Created {result.created} link{result.created !== 1 ? "s" : ""}.
              {result.failed.length > 0 && ` ${result.failed.length} failed.`}
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

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {result ? "Close" : "Cancel"}
          </Button>
          {linkProgress.length === 0 && (
            <Button type="submit" variant="primary" disabled={isSubmitting || validCount === 0}>
              Add {validCount} link{validCount !== 1 ? "s" : ""}
            </Button>
          )}
          {linkProgress.length > 0 && isSubmitting && (
            <span className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 py-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {(() => {
                const addingIndex = linkProgress.findIndex((p) => p.status === "adding");
                const current = addingIndex >= 0 ? addingIndex + 1 : linkProgress.length;
                const total = linkProgress.length;
                return `Adding link ${current} of ${total}…`;
              })()}
            </span>
          )}
        </div>
      </form>
    </Dialog>
  );
}
