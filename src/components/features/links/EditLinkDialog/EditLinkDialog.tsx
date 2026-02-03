"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateLink, extractLinkMetadataAction, refetchLinkFavicon, getLinkTagSuggestions } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

interface EditLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: {
    id: string;
    url: string;
    title: string;
    description: string | null;
    favicon: string | null;
    linkType: string;
    tags: string[];
    notes: string | null;
    isFavorite: boolean;
    rating: number | null;
    collections: Array<{
      collection: {
        id: string;
        name: string;
        color: string | null;
      };
    }>;
    metadataExtractedAt: Date | null;
  };
}

export function EditLinkDialog({ open, onOpenChange, link }: EditLinkDialogProps) {
  const router = useRouter();
  const [url, setUrl] = React.useState(link.url);
  const [title, setTitle] = React.useState(link.title);
  const [description, setDescription] = React.useState(link.description || "");
  const [favicon, setFavicon] = React.useState(link.favicon || "");
  const [linkType, setLinkType] = React.useState<"WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER">(
    link.linkType as any
  );
  const [tags, setTags] = React.useState<string[]>(link.tags);
  const [tagInput, setTagInput] = React.useState("");
  const [notes, setNotes] = React.useState(link.notes || "");
  const [isFavorite, setIsFavorite] = React.useState(link.isFavorite);
  const [rating, setRating] = React.useState<number | null>(link.rating);
  const [selectedCollections, setSelectedCollections] = React.useState<string[]>(
    link.collections.map((c) => c.collection.id)
  );
  const [collections, setCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extractingMetadata, setExtractingMetadata] = React.useState(false);
  const [updatingFavicon, setUpdatingFavicon] = React.useState(false);
  const [metadataRefreshed, setMetadataRefreshed] = React.useState(false);
  const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = React.useState(false);
  const tagInputContainerRef = React.useRef<HTMLDivElement>(null);

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

  // Reset form when link changes
  React.useEffect(() => {
    if (link) {
      setUrl(link.url);
      setTitle(link.title);
      setDescription(link.description || "");
      setFavicon(link.favicon || "");
      setLinkType(link.linkType as any);
      setTags(link.tags);
      setNotes(link.notes || "");
      setIsFavorite(link.isFavorite);
      setRating(link.rating);
      setSelectedCollections(link.collections.map((c) => c.collection.id));
      setMetadataRefreshed(false);
    }
  }, [link]);

  const handleRefreshMetadata = async () => {
    if (!url.trim()) return;

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setError("Invalid URL");
      return;
    }

    setExtractingMetadata(true);
    setError(null);

    try {
      const result = await extractLinkMetadataAction(formattedUrl);
      if (result.success && result.data) {
        if (result.data.title) {
          setTitle(result.data.title);
        }
        if (result.data.description) {
          setDescription(result.data.description);
        }
        if (result.data.favicon) {
          setFavicon(result.data.favicon);
        }
        // Mark that fresh metadata was fetched so we can re-extract
        // and persist enriched metadata (including GitHub stats) on save.
        setMetadataRefreshed(true);
      }
    } catch (error) {
      setError("Failed to extract metadata");
    } finally {
      setExtractingMetadata(false);
    }
  };

  const handleRefetchFavicon = async () => {
    if (!url.trim()) return;

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setError("Invalid URL");
      return;
    }

    setUpdatingFavicon(true);
    setError(null);

    try {
      const result = await refetchLinkFavicon(link.id, formattedUrl);
      if (result.success && result.data) {
        setFavicon(result.data.favicon || "");
      } else if (!result.success) {
        setError(result.error || "Failed to refetch favicon");
      }
    } catch (err) {
      console.error("Refetch favicon error:", err);
      setError("Failed to refetch favicon");
    } finally {
      setUpdatingFavicon(false);
    }
  };

  const handleUploadFavicon = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUpdatingFavicon(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/links/upload-favicon", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to upload favicon");
      }

      const data = await response.json();
      if (data.url) {
        setFavicon(data.url);
      }
    } catch (err) {
      console.error("Favicon upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload favicon");
    } finally {
      setUpdatingFavicon(false);
      // Reset the input so the same file can be selected again if needed
      event.target.value = "";
    }
  };

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
      const result = await updateLink(link.id, {
        url: formattedUrl,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        favicon: favicon.trim() || undefined,
        linkType,
        tags,
        notes: notes.trim() || undefined,
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollections,
        // If URL changed or user explicitly refreshed metadata in this dialog,
        // trigger a fresh server-side metadata extraction (which includes
        // GitHub repo stats for GitHub links).
        extractMetadata: metadataRefreshed || url !== link.url,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update link");
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
      title="Edit Link"
      description="Update link information"
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-6">
        {error && (
          <div className="mb-6 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
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
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
              />
            </div>

            {/* Favicon Controls */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Favicon
              </label>
              <div className="flex items-center gap-3 mb-2">
                {favicon ? (
                  <Image
                    src={favicon}
                    alt="Favicon preview"
                    width={24}
                    height={24}
                    unoptimized
                    className="w-6 h-6 rounded border border-neutral-200 dark:border-neutral-700"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    No favicon set
                  </span>
                )}
                {favicon && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                    {favicon}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <div>
                  <input
                    id="upload-favicon-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadFavicon}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("upload-favicon-input")?.click()}
                    disabled={updatingFavicon}
                  >
                    Choose Favicon
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRefetchFavicon}
                  disabled={updatingFavicon || extractingMetadata}
                >
                  {updatingFavicon ? "Updating..." : "Refetch from URL"}
                </Button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Title
                </label>
                <button
                  type="button"
                  onClick={handleRefreshMetadata}
                  disabled={extractingMetadata}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {extractingMetadata ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Extracting...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Metadata
                    </>
                  )}
                </button>
              </div>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Link title"
              />
              {link.metadataExtractedAt && (
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Metadata extracted: {formatDate(link.metadataExtractedAt)}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Link description"
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

          {/* Organization Section */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Organization
              </h3>
            </div>

            {collections.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Collections
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50">
                  {collections.map((collection) => (
                    <label key={collection.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-white dark:hover:bg-neutral-700 transition-colors">
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
                        className="w-4 h-4 text-primary-600 dark:text-primary-400 rounded border-neutral-300 dark:border-neutral-600 focus:ring-primary-500 focus:ring-2"
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300 flex-1">{collection.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Personal Notes
              </label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add personal notes or annotations..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="w-4 h-4 text-primary-600 dark:text-primary-400 rounded border-neutral-300 dark:border-neutral-600 focus:ring-primary-500 focus:ring-2"
              />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors">
                Mark as Favorite
              </span>
            </label>
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
                Updating...
              </span>
            ) : (
              "Update Link"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
