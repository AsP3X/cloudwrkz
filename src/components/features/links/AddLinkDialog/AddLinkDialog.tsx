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
  selectedCollectionId?: string;
  selectedCollectionName?: string;
}

export function AddLinkDialog({ open, onOpenChange, selectedCollectionId, selectedCollectionName }: AddLinkDialogProps) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [linkType, setLinkType] = React.useState<"WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER">("WEBSITE");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [rating, setRating] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extractingMetadata, setExtractingMetadata] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setTitle("");
      setDescription("");
      setLinkType("WEBSITE");
      setTags([]);
      setTagInput("");
      setIsFavorite(false);
      setRating(null);
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
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollectionId ? [selectedCollectionId] : [],
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
    // Proceed with creation anyway, bypassing duplicate check
    const formattedUrl = formatLinkUrl(url);
    setIsSubmitting(true);

    try {
      const result = await createLink({
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        linkType,
        tags,
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollectionId ? [selectedCollectionId] : [],
        extractMetadata: false, // Don't extract again
        allowDuplicates: true, // Allow creating duplicate
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
        headerRightContent={
          <button
            type="button"
            onClick={() => setIsFavorite(!isFavorite)}
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <svg
              className={isFavorite ? "w-5 h-5 text-yellow-500 fill-current" : "w-5 h-5 text-neutral-400 hover:text-yellow-500 transition-colors"}
              fill={isFavorite ? "currentColor" : "none"}
              viewBox="0 0 20 20"
              stroke={isFavorite ? "none" : "currentColor"}
              strokeWidth={isFavorite ? 0 : 1.5}
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        }
      >
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-6">
          {error && (
            <div className="mb-6 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
          )}

          {/* Collection Info */}
          {selectedCollectionName && (
            <div className="mb-6 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
              <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>This link will be saved to <span className="font-medium text-primary-700 dark:text-primary-300">{selectedCollectionName}</span></span>
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information Section */}
            <div className="space-y-4">
              <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  Basic Information
                </h3>
              </div>

              <div>
                <label htmlFor="url" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  URL <span className="text-error-600 dark:text-error-400">*</span>
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
                      <svg className="animate-spin h-5 w-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}
                </div>
                {extractingMetadata && (
                  <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">Extracting metadata...</p>
                )}
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
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
                <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Description
                </label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Link description (auto-filled from metadata)"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Classification Section */}
            <div className="space-y-4">
              <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  Classification
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="linkType" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
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
                  <label htmlFor="rating" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
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
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-3">
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
                    placeholder="Add a tag and press Enter"
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleAddTag} variant="outline" size="sm">
                    Add
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm font-medium border border-primary-200 dark:border-primary-800"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-primary-900 dark:hover:text-primary-100 transition-colors"
                          aria-label={`Remove ${tag} tag`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                "Create Link"
              )}
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
          headerIcon={
            <div className="w-8 h-8 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-warning-600 dark:text-warning-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          }
        >
            <div className="p-6 space-y-6">
              {/* Warning Message */}
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    This URL appears to be a duplicate of an existing link in your collection.
                  </p>
                </div>

                {/* URL Display */}
                <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">
                    URL
                  </p>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 break-all font-mono">
                    {formatLinkUrl(url)}
                  </p>
                </div>

                {/* Info Message */}
                <div className="rounded-lg bg-warning-50 dark:bg-warning-950/50 border border-warning-200 dark:border-warning-800 p-4">
                  <p className="text-sm text-warning-800 dark:text-warning-200">
                    You can still create this link if needed, but consider updating the existing one instead.
                  </p>
                </div>
              </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                onClick={() => setShowDuplicateDialog(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleProceedWithDuplicate}
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Anyway"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
