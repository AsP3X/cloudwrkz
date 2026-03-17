"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { copySharedLinkToMyCollection } from "@/server/actions/links";
import { getUserCollections } from "@/server/actions/collections";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

interface CopyToMyCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkId: string;
  linkTitle: string;
}

export function CopyToMyCollectionDialog({
  open,
  onOpenChange,
  linkId,
  linkTitle,
}: CopyToMyCollectionDialogProps) {
  const router = useRouter();
  const [collections, setCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [selectedCollectionId, setSelectedCollectionId] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      getUserCollections("").then((cols) => {
        setCollections(cols);
        setSelectedCollectionId(cols[0]?.id ?? "");
      });
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  const handleCopy = async () => {
    if (!selectedCollectionId) {
      setError("Please select a collection");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await copySharedLinkToMyCollection(linkId, selectedCollectionId);
      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to add link to collection");
      }
    } catch (err) {
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add to my collection"
      description={`Copy "${linkTitle}" into one of your collections. The original link is unchanged.`}
      className="max-w-md shadow-2xl"
      zIndex={60}
    >
      <div className="px-4 sm:px-6 py-4 sm:py-6">
        {error && (
          <div className="mb-4 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <label htmlFor="copy-to-collection" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Collection
          </label>
          <select
            id="copy-to-collection"
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {collections.length === 0 ? (
              <option value="">No collections yet</option>
            ) : (
              collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          {collections.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Create a collection first from the Links page.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleCopy}
            disabled={!selectedCollectionId || isSubmitting || collections.length === 0}
          >
            {isSubmitting ? "Adding..." : "Add to collection"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
