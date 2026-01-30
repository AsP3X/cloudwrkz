"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createLink, extractLinkMetadataAction, checkDuplicateUrl, getLinkTagSuggestions } from "@/server/actions/links";
import { formatLinkUrl, validateUrl, isYouTubeUrl } from "@/lib/utils/links";
import { cn } from "@/lib/utils/cn";

interface AddLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCollectionId?: string;
  selectedCollectionName?: string;
  selectedCollectionColor?: string | null;
}

export function AddLinkDialog({ open, onOpenChange, selectedCollectionId, selectedCollectionName, selectedCollectionColor }: AddLinkDialogProps) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [collectionRemoved, setCollectionRemoved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extractingMetadata, setExtractingMetadata] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = React.useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = React.useState(false);
  const [collections, setCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [manuallySelectedCollectionId, setManuallySelectedCollectionId] = React.useState<string | null>(null);
  const [manuallySelectedCollectionName, setManuallySelectedCollectionName] = React.useState<string | null>(null);
  const [manuallySelectedCollectionColor, setManuallySelectedCollectionColor] = React.useState<string | null>(null);
  const [hasExactDuplicate, setHasExactDuplicate] = React.useState(false);
  const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = React.useState(false);
  const tagInputContainerRef = React.useRef<HTMLDivElement>(null);

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setTitle("");
      setDescription("");
      setTags([]);
      setTagInput("");
      setIsFavorite(false);
      setCollectionRemoved(false);
      setManuallySelectedCollectionId(null);
      setManuallySelectedCollectionName(null);
      setManuallySelectedCollectionColor(null);
      setError(null);
      setDuplicateWarning([]);
      setHasExactDuplicate(false);
      setShowDuplicateDialog(false);
      setShowCollectionDialog(false);
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
          // For YouTube URLs, always use the video title
          if (isYouTubeUrl(formattedUrl) && result.data.title) {
            setTitle(result.data.title);
          } else if (!title && result.data.title) {
            // For other URLs, only set title if it's empty
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
      setShowTagSuggestions(false);
    }
  };

  const handleSelectTagSuggestion = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
    setTagSuggestions([]);
    setShowTagSuggestions(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // Fetch tag suggestions when typing (debounced)
  React.useEffect(() => {
    const q = tagInput.trim();
    if (!q) {
      setTagSuggestions([]);
      setShowTagSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      getLinkTagSuggestions(q).then((suggestions) => {
        const filtered = suggestions.filter((s) => !tags.includes(s));
        setTagSuggestions(filtered);
        setShowTagSuggestions(filtered.length > 0);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [tagInput, tags]);

  // Close tag suggestions when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagInputContainerRef.current && !tagInputContainerRef.current.contains(e.target as Node)) {
        setShowTagSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load collections when collection dialog opens
  React.useEffect(() => {
    if (showCollectionDialog) {
      import("@/server/actions/collections").then(({ getUserCollections }) => {
        getUserCollections("").then((cols) => {
          setCollections(cols.map((c) => ({ id: c.id, name: c.name, color: c.color })));
        });
      });
    }
  }, [showCollectionDialog]);

  const handleSelectCollection = (collectionId: string, collectionName: string, collectionColor: string | null) => {
    setManuallySelectedCollectionId(collectionId);
    setManuallySelectedCollectionName(collectionName);
    setManuallySelectedCollectionColor(collectionColor);
    setCollectionRemoved(false);
    setShowCollectionDialog(false);
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
      const finalCollectionId = manuallySelectedCollectionId || (!collectionRemoved && selectedCollectionId ? selectedCollectionId : null);
      const result = await createLink({
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags,
        isFavorite,
        collectionIds: finalCollectionId ? [finalCollectionId] : [],
        extractMetadata: true,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        const hasDuplicates = !!(result.duplicateLinkIds && result.duplicateLinkIds.length > 0);
        const hasSimilar = !!(result.similarLinkIds && result.similarLinkIds.length > 0);

        // Show a confirmation dialog when we have either exact duplicates or very similar links
        if (hasDuplicates || hasSimilar) {
          setHasExactDuplicate(hasDuplicates);
          setDuplicateWarning(result.duplicateLinkIds || result.similarLinkIds || []);
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
      const finalCollectionId = manuallySelectedCollectionId || (!collectionRemoved && selectedCollectionId ? selectedCollectionId : null);
      const result = await createLink({
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags,
        isFavorite,
        collectionIds: finalCollectionId ? [finalCollectionId] : [],
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
          {(manuallySelectedCollectionName || (selectedCollectionName && !collectionRemoved)) && (() => {
            const currentCollectionName = manuallySelectedCollectionName || selectedCollectionName;
            const currentCollectionColor = manuallySelectedCollectionColor || selectedCollectionColor;
            const hasColor = currentCollectionColor && /^#[0-9A-Fa-f]{6}$/.test(currentCollectionColor);
            const colorValue = hasColor ? currentCollectionColor : null;
            
            return (
              <div 
                className={cn(
                  "mb-6 flex items-center justify-between gap-2 text-sm p-3 rounded-lg border",
                  !hasColor && "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400"
                )}
                style={
                  hasColor && colorValue
                    ? {
                        backgroundColor: `${colorValue}15`,
                        borderColor: colorValue,
                        color: colorValue,
                      }
                    : undefined
                }
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>This link will be saved to <span className="font-medium">{currentCollectionName}</span></span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCollectionRemoved(true);
                    setManuallySelectedCollectionId(null);
                    setManuallySelectedCollectionName(null);
                    setManuallySelectedCollectionColor(null);
                  }}
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    !hasColor && "hover:bg-primary-100 dark:hover:bg-primary-900/40 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                  )}
                  style={
                    hasColor && colorValue
                      ? {
                          color: colorValue,
                        }
                      : undefined
                  }
                  aria-label="Remove collection assignment"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })()}

          {/* Assign Collection Link */}
          {collectionRemoved && !manuallySelectedCollectionId && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setShowCollectionDialog(true)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline transition-colors"
              >
                Assign collection
              </button>
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

            {/* Tags Section */}
            <div className="space-y-4">
              <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                  Tags
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Tags
                </label>
                <div ref={tagInputContainerRef} className="relative flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (showTagSuggestions && tagSuggestions.length > 0) {
                            handleSelectTagSuggestion(tagSuggestions[0]);
                          } else {
                            handleAddTag();
                          }
                        }
                      }}
                      onFocus={() => tagSuggestions.length > 0 && setShowTagSuggestions(true)}
                      placeholder="Add a tag and press Enter"
                      className="flex-1 w-full"
                    />
                    {showTagSuggestions && tagSuggestions.length > 0 && (
                      <div
                        className="absolute z-50 mt-1.5 w-full rounded-lg border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 p-3 shadow-md"
                        role="listbox"
                      >
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                          Suggested tags
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {tagSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              role="option"
                              aria-selected={false}
                              className={cn(
                                "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-colors",
                                "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300",
                                "hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-200 dark:hover:border-primary-800 hover:text-primary-700 dark:hover:text-primary-300"
                              )}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectTagSuggestion(suggestion);
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
        title={hasExactDuplicate ? "Duplicate Link Detected" : "Similar Link Detected"}
        description={
          hasExactDuplicate
            ? "A link with this exact URL already exists. Do you want to proceed anyway?"
            : "A very similar link already exists. Do you want to proceed anyway?"
        }
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
                    {hasExactDuplicate
                      ? "This URL appears to be a duplicate of an existing link in your collection."
                      : "This URL is very similar to an existing link in your collection (for example, only a few characters differ)."}
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

      {/* Collection Selection Dialog */}
      {showCollectionDialog && (
        <Dialog
          open={showCollectionDialog}
          onOpenChange={setShowCollectionDialog}
          title="Select Collection"
          description="Choose a collection to save this link to"
          zIndex={60}
        >
          <div className="p-6">
            {collections.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  No collections available. Create a collection first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {collections.map((collection) => {
                  const hasColor = collection.color && /^#[0-9A-Fa-f]{6}$/.test(collection.color);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => handleSelectCollection(collection.id, collection.name, collection.color)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left"
                    >
                      {hasColor && (
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: collection.color! }}
                        />
                      )}
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 flex-1">
                        {collection.name}
                      </span>
                      <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
              <Button variant="outline" onClick={() => setShowCollectionDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
