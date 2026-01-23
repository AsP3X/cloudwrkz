"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createLink, extractLinkMetadataAction, checkDuplicateUrl } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";

interface AddLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLinkDialog({ open, onOpenChange }: AddLinkDialogProps) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [linkType, setLinkType] = React.useState<"WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER">("WEBSITE");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [rating, setRating] = React.useState<number | null>(null);
  const [selectedCollections, setSelectedCollections] = React.useState<string[]>([]);
  const [collections, setCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extractingMetadata, setExtractingMetadata] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);

  // Load collections
  React.useEffect(() => {
    if (open) {
      import("@/server/actions/collections").then(({ getUserCollections }) => {
        getUserCollections("").then((cols) => {
          setCollections(cols.map((c) => ({ id: c.id, name: c.name, color: c.color })));
        });
      });
    }
  }, [open]);

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setTitle("");
      setDescription("");
      setLinkType("WEBSITE");
      setTags([]);
      setTagInput("");
      setNotes("");
      setIsFavorite(false);
      setRating(null);
      setSelectedCollections([]);
      setError(null);
      setDuplicateWarning([]);
      setShowDuplicateDialog(false);
    }
  }, [open]);

  // Extract metadata when URL changes
  const handleUrlChange = React.useCallback(
    async (newUrl: string) => {
      setUrl(newUrl);
      if (!newUrl.trim()) {
        setTitle("");
        setDescription("");
        return;
      }

      const formattedUrl = formatLinkUrl(newUrl);
      if (!validateUrl(formattedUrl)) {
        return;
      }

      // Check for duplicates
      try {
        // We need to get current user ID - for now, just check on submit
      } catch (error) {
        // Ignore
      }

      // Extract metadata
      setExtractingMetadata(true);
      try {
        const result = await extractLinkMetadataAction(formattedUrl);
        if (result.success && result.data) {
          if (!title && result.data.title) {
            setTitle(result.data.title);
          }
          if (!description && result.data.description) {
            setDescription(result.data.description);
          }
        }
      } catch (error) {
        // Ignore metadata extraction errors
      } finally {
        setExtractingMetadata(false);
      }
    },
    [title, description]
  );

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("URL is required");
      return;
    }

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setError("Please enter a valid URL");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createLink({
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        linkType,
        tags,
        notes: notes.trim() || undefined,
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollections,
        extractMetadata: true,
      });

      if (result.success) {
        if (result.duplicateLinkIds && result.duplicateLinkIds.length > 0) {
          setDuplicateWarning(result.duplicateLinkIds);
          setShowDuplicateDialog(true);
        } else {
          onOpenChange(false);
          router.refresh();
        }
      } else {
        if (result.duplicateLinkIds && result.duplicateLinkIds.length > 0) {
          setDuplicateWarning(result.duplicateLinkIds);
          setShowDuplicateDialog(true);
        } else {
          setError(result.error || "Failed to create link");
        }
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedWithDuplicate = async () => {
    setShowDuplicateDialog(false);
    // Proceed with creation anyway
    const formattedUrl = formatLinkUrl(url);
    setIsSubmitting(true);

    try {
      const result = await createLink({
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        linkType,
        tags,
        notes: notes.trim() || undefined,
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollections,
        extractMetadata: false, // Don't extract again
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to create link");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Add Link"
        description="Save a new bookmark to your collection"
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-md">
              <p className="text-sm text-error-800 dark:text-error-200">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="url" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              URL <span className="text-error-600">*</span>
            </label>
            <div className="relative">
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com"
                required
                className="pr-10"
              />
              {extractingMetadata && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Title
            </label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Link title (auto-filled from metadata)"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Description
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Link description (auto-filled from metadata)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="linkType" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Type
              </label>
              <Select
                id="linkType"
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as any)}
                options={[
                  { value: "WEBSITE", label: "Website" },
                  { value: "FILE", label: "File" },
                  { value: "DOCUMENT", label: "Document" },
                  { value: "VIDEO", label: "Video" },
                  { value: "IMAGE", label: "Image" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
            </div>

            <div>
              <label htmlFor="rating" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Rating
              </label>
              <Select
                id="rating"
                value={rating?.toString() || ""}
                onChange={(e) => setRating(e.target.value ? parseInt(e.target.value) : null)}
                options={[
                  { value: "", label: "No rating" },
                  { value: "1", label: "1 Star" },
                  { value: "2", label: "2 Stars" },
                  { value: "3", label: "3 Stars" },
                  { value: "4", label: "4 Stars" },
                  { value: "5", label: "5 Stars" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add a tag"
                className="flex-1"
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-primary-900 dark:hover:text-primary-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {collections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Collections
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-md p-2">
                {collections.map((collection) => (
                  <label key={collection.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCollections.includes(collection.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCollections([...selectedCollections, collection.id]);
                        } else {
                          setSelectedCollections(selectedCollections.filter((id) => id !== collection.id));
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">{collection.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Notes
            </label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal notes or annotations..."
              rows={3}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">Favorite</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Link"}
            </Button>
          </div>
        </form>
      </Dialog>

      {showDuplicateDialog && (
        <Dialog
          open={showDuplicateDialog}
          onOpenChange={setShowDuplicateDialog}
          title="Duplicate Link Detected"
          description="A link with this URL already exists. Do you want to proceed anyway?"
        >
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              This URL appears to be a duplicate of an existing link in your collection.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleProceedWithDuplicate}>
                Create Anyway
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
