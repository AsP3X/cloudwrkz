"use client";

import React from "react";
import Image from "next/image";
import { useForm, FormProvider } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { updateLink, extractLinkMetadataAction, refetchLinkFavicon, getLinkTagSuggestions } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";
import { cn } from "@/lib/utils/cn";

const LINK_TYPE_OPTIONS = [
  { value: "WEBSITE", label: "Website" },
  { value: "FILE", label: "File" },
  { value: "DOCUMENT", label: "Document" },
  { value: "VIDEO", label: "Video" },
  { value: "IMAGE", label: "Image" },
  { value: "OTHER", label: "Other" },
];


interface LinkEditFormProps {
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
  };
  collections: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
  renderRatingField?: (props: {
    currentRating: number | null;
    displayRating: number | null;
    hoveredRating: number | null;
    setHoveredRating: (rating: number | null) => void;
    setValue: (name: string, value: string, options?: any) => void;
  }) => React.ReactNode;
  onRatingInputReady?: (renderFn: (props: { watch: any; setValue: any }) => React.ReactNode) => void;
  onFormMethodsReady?: (methods: { watch: any; setValue: any }) => void;
}

export const LinkEditForm = ({ link, collections, onCancel, onSaveSuccess, renderRatingField, onRatingInputReady, onFormMethodsReady }: LinkEditFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [tags, setTags] = React.useState<string[]>(link.tags);
  const [tagInput, setTagInput] = React.useState("");
  const [selectedCollections, setSelectedCollections] = React.useState<string[]>(
    link.collections.map((c) => c.collection.id)
  );
  const [extractingMetadata, setExtractingMetadata] = React.useState(false);
  const [metadataRefreshed, setMetadataRefreshed] = React.useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = React.useState(false);
  const [metadataPreview, setMetadataPreview] = React.useState<any | null>(null);
  const [metadataPreviewStatus, setMetadataPreviewStatus] = React.useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);
  const [showCollectionDialog, setShowCollectionDialog] = React.useState(false);
  const [availableCollections, setAvailableCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = React.useState(false);
  const tagInputContainerRef = React.useRef<HTMLDivElement>(null);

  const methods = useForm({
    defaultValues: {
      url: link.url,
      title: link.title,
      description: link.description || "",
      notes: link.notes || "",
      linkType: link.linkType as "WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER",
      rating: link.rating?.toString() || "",
      isFavorite: link.isFavorite,
      favicon: link.favicon || "",
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = methods;

  const currentRating = watch("rating") ? parseInt(watch("rating")) : null;
  const displayRating = hoveredRating ?? currentRating;

  // Reset metadata refresh flag when the link changes (e.g. navigating to a different link)
  React.useEffect(() => {
    setMetadataRefreshed(false);
  }, [link.id]);

  // Expose form methods to parent (only once on mount)
  React.useEffect(() => {
    if (onFormMethodsReady) {
      onFormMethodsReady({ watch, setValue });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Expose rating input render function to parent (only once on mount)
  React.useEffect(() => {
    if (onRatingInputReady) {
      const createRatingInput = (formProps: { watch: any; setValue: any }) => {
        const RatingInput = () => {
          const [localHoveredRating, setLocalHoveredRating] = React.useState<number | null>(null);
          const localCurrentRating = formProps.watch("rating") ? parseInt(formProps.watch("rating")) : null;
          const localDisplayRating = localHoveredRating ?? localCurrentRating;

          return (
            <div className="flex items-center justify-center gap-2">
              <div
                className="flex items-center gap-1"
                onMouseLeave={() => setLocalHoveredRating(null)}
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      const newRating = localCurrentRating === star ? null : star;
                      formProps.setValue("rating", newRating ? newRating.toString() : "", { shouldValidate: true });
                    }}
                    onMouseEnter={() => setLocalHoveredRating(star)}
                    className="transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
                    aria-label={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
                  >
                    <svg
                      className={`w-5 h-5 transition-colors ${
                        star <= (localDisplayRating ?? 0)
                          ? "text-yellow-500 fill-current"
                          : "text-neutral-400 dark:text-neutral-500 fill-none hover:text-yellow-400"
                      }`}
                      fill={star <= (localDisplayRating ?? 0) ? "currentColor" : "none"}
                      viewBox="0 0 20 20"
                      stroke={star <= (localDisplayRating ?? 0) ? "none" : "currentColor"}
                      strokeWidth={1.5}
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
              {localCurrentRating && (
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {localCurrentRating} {localCurrentRating === 1 ? 'star' : 'stars'}
                </span>
              )}
            </div>
          );
        };
        return <RatingInput />;
      };
      onRatingInputReady(createRatingInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleRefreshMetadata = async () => {
    const url = watch("url");
    if (!url.trim()) return;

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setServerError("Invalid URL");
      return;
    }

    setExtractingMetadata(true);
    setServerError(null);
    setShowMetadataDialog(true);
    setMetadataPreview(null);
    setMetadataPreviewStatus("loading");

    try {
      const result = await extractLinkMetadataAction(formattedUrl);
      if (result.success && result.data) {
        if (result.data.title) {
          setValue("title", result.data.title);
        }
        if (result.data.description) {
          setValue("description", result.data.description);
        }
        if (result.data.favicon) {
          setValue("favicon", result.data.favicon);
        }
        // Mark that we explicitly refreshed metadata so on save the server
        // re-extracts and persists enriched metadata (e.g. GitHub stats).
        setMetadataRefreshed(true);
        setMetadataPreview(result.data);
        setMetadataPreviewStatus("loaded");
      } else {
        setMetadataPreviewStatus("error");
      }
    } catch (error) {
      setServerError("Failed to extract metadata");
      setMetadataPreviewStatus("error");
    } finally {
      setExtractingMetadata(false);
    }
  };

  const handleRefetchFavicon = async () => {
    const url = watch("url");
    if (!url.trim()) return;

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setServerError("Invalid URL");
      return;
    }

    setExtractingMetadata(true);
    setServerError(null);

    try {
      const result = await refetchLinkFavicon(link.id, formattedUrl);
      if (result.success && result.data) {
        setValue("favicon", result.data.favicon || "");
      } else if (!result.success) {
        setServerError(result.error || "Failed to refetch favicon");
      }
    } catch (error) {
      setServerError("Failed to refetch favicon");
    } finally {
      setExtractingMetadata(false);
    }
  };

  const handleUploadFavicon = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setExtractingMetadata(true);
    setServerError(null);

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
        setValue("favicon", data.url);
      }
    } catch (error) {
      console.error("Favicon upload error:", error);
      setServerError(error instanceof Error ? error.message : "Failed to upload favicon");
    } finally {
      setExtractingMetadata(false);
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

  // Load collections when collection dialog opens
  React.useEffect(() => {
    if (showCollectionDialog) {
      import("@/server/actions/collections").then(({ getUserCollections }) => {
        getUserCollections("").then((cols) => {
          setAvailableCollections(cols.map((c) => ({ id: c.id, name: c.name, color: c.color })));
        });
      });
    }
  }, [showCollectionDialog]);

  const handleSelectCollection = (collectionId: string) => {
    if (!selectedCollections.includes(collectionId)) {
      setSelectedCollections([...selectedCollections, collectionId]);
    }
    setShowCollectionDialog(false);
  };

  const handleRemoveCollection = (collectionId: string) => {
    setSelectedCollections(selectedCollections.filter((id) => id !== collectionId));
  };

  const onSubmit = async (data: any) => {
    setServerError(null);

    const url = data.url.trim();
    if (!url) {
      setServerError("URL is required");
      return;
    }

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      setServerError("Please enter a valid URL");
      return;
    }

    try {
      const result = await updateLink(link.id, {
        url: formattedUrl,
        title: data.title.trim() || undefined,
        description: data.description || undefined,
        favicon: data.favicon?.trim() || undefined,
        linkType: data.linkType,
        tags,
        notes: data.notes || undefined,
        isFavorite: data.isFavorite,
        rating: data.rating ? parseInt(data.rating) : undefined,
        collectionIds: selectedCollections,
        // If URL changed or the user clicked "Refresh Metadata" in this form,
        // trigger a fresh server-side extraction so enriched metadata (e.g.
        // GitHub repo stats) is persisted even for existing links.
        extractMetadata: metadataRefreshed || url !== link.url,
      });

      if (result.success) {
        if (onSaveSuccess) {
          onSaveSuccess();
        } else {
          router.push(`/dashboard/links/${link.id}`);
        }
        router.refresh();
      } else {
        setServerError(result.error || "Failed to update link");
      }
    } catch (error) {
      console.error("Link update error:", error);
      setServerError("An unexpected error occurred. Please try again.");
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleFormSubmit} className="space-y-6" noValidate>
      {/* Server Error Message */}
      {serverError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{serverError}</p>
          </div>
        </div>
      )}

      {/* Title Field */}
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
          placeholder="Link title"
          error={errors.title?.message as string}
          {...register("title")}
        />
      </div>

      {/* URL Field and Collections Label */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Input
            label="URL"
            type="url"
            placeholder="https://example.com"
            error={errors.url?.message as string}
            helperText="The web address for this link"
            required
            {...register("url", { required: "URL is required" })}
          />

          {/* Favicon Controls */}
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Favicon
            </label>
            <div className="flex items-center gap-3 mb-1">
              {watch("favicon") ? (
                <Image
                  src={watch("favicon")}
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
              {watch("favicon") && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">
                  {watch("favicon")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <div>
                <input
                  id="link-edit-upload-favicon-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadFavicon}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("link-edit-upload-favicon-input")?.click()}
                  disabled={isSubmitting}
                >
                  Choose Favicon
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefetchFavicon}
                disabled={isSubmitting || extractingMetadata}
              >
                Refetch from URL
              </Button>
            </div>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
            Collections
          </label>
          
          {/* Selected Collections Display */}
          {selectedCollections.length > 0 && (
            <div className="space-y-2 mb-3">
              {selectedCollections.map((collectionId) => {
                const collection = collections.find((c) => c.id === collectionId);
                if (!collection) return null;
                
                const hasColor = collection.color && /^#[0-9A-Fa-f]{6}$/.test(collection.color);
                const colorValue = hasColor ? collection.color : null;
                
                return (
                  <div
                    key={collectionId}
                    className={cn(
                      "flex items-center justify-between gap-2 text-sm p-3 rounded-lg border",
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
                      <span className="font-medium">{collection.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCollection(collectionId)}
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
              })}
            </div>
          )}

          {/* Assign Collection Button */}
          <button
            type="button"
            onClick={() => setShowCollectionDialog(true)}
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline transition-colors"
          >
            {selectedCollections.length > 0 ? "Add another collection" : "Assign collection"}
          </button>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Tags
        </label>
        <div ref={tagInputContainerRef} className="relative flex items-center gap-2 mb-3">
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
          <Button
            type="button"
            onClick={handleAddTag}
            variant="outline"
            size="md"
            className="flex-shrink-0 min-w-[5.5rem]"
            aria-label="Add tag"
          >
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

      {/* Description Field */}
      <div>
        <RichTextEditor
          label="Description"
          placeholder="Provide a description of the link..."
          error={errors.description?.message as string}
          helperText="Include any relevant details about this link"
          value={watch("description") || ""}
          onChange={(html) => {
            setValue("description", html, { shouldValidate: true });
          }}
          onImageUpload={async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/tickets/upload-image", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error("Failed to upload image");
            }
            const data = await response.json();
            return data.url;
          }}
          name="description"
        />
      </div>

      {/* Notes Field */}
      <div>
        <RichTextEditor
          label="Personal Notes"
          placeholder="Add personal notes or annotations..."
          error={errors.notes?.message as string}
          helperText="Private notes visible only to you"
          value={watch("notes") || ""}
          onChange={(html) => {
            setValue("notes", html, { shouldValidate: true });
          }}
          onImageUpload={async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/tickets/upload-image", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error("Failed to upload image");
            }
            const data = await response.json();
            return data.url;
          }}
          name="notes"
        />
      </div>


      {/* Rating Field - removed, only shown in header */}
      <input type="hidden" {...register("rating")} />

      {/* Collection Selection Dialog */}
      {showCollectionDialog && (
        <Dialog
          open={showCollectionDialog}
          onOpenChange={setShowCollectionDialog}
          title="Select Collection"
          description="Choose a collection to add this link to"
          zIndex={60}
        >
          <div className="p-6">
            {availableCollections.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  No collections available. Create a collection first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableCollections
                  .filter((c) => !selectedCollections.includes(c.id))
                  .map((collection) => {
                    const hasColor = collection.color && /^#[0-9A-Fa-f]{6}$/.test(collection.color);
                    return (
                      <button
                        key={collection.id}
                        type="button"
                        onClick={() => handleSelectCollection(collection.id)}
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
                {availableCollections.filter((c) => !selectedCollections.includes(c.id)).length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      All available collections have been added.
                    </p>
                  </div>
                )}
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

      {/* Favorite Toggle - moved to header */}
      <input type="hidden" {...register("isFavorite")} />

      {/* Submit Buttons */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              router.back();
            }
          }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Updating Link..." : "Update Link"}
        </Button>
      </div>
    </form>

    {/* Metadata Preview Dialog (shown during/after Refresh Metadata) */}
    <Dialog
      open={showMetadataDialog}
      onOpenChange={setShowMetadataDialog}
      title="Metadata extraction"
      description="Information gathered from this URL."
      className="sm:max-w-lg"
    >
      <div className="p-5 space-y-4">
        {metadataPreviewStatus === "loading" && (
          <div className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
            <span>Extracting metadata…</span>
          </div>
        )}

        {metadataPreviewStatus === "error" && (
          <p className="text-sm text-error-600 dark:text-error-400">
            Failed to extract metadata. You can still edit and save the link.
          </p>
        )}

        {metadataPreview && metadataPreviewStatus === "loaded" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">
                Basic
              </h3>
              <ul className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <li>
                  <span className="font-medium">Title:</span>{" "}
                  <span>{metadataPreview.title || "—"}</span>
                </li>
                <li>
                  <span className="font-medium">Description:</span>{" "}
                  <span>{metadataPreview.description || "—"}</span>
                </li>
                <li>
                  <span className="font-medium">Favicon:</span>{" "}
                  {metadataPreview.favicon ? (
                    <a
                      href={metadataPreview.favicon}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline break-all"
                    >
                      {metadataPreview.favicon}
                    </a>
                  ) : (
                    <span>—</span>
                  )}
                </li>
              </ul>
            </div>

            {(metadataPreview.githubRepo || metadataPreview.githubStars != null) && (
              <div>
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1.5">
                  GitHub
                </h3>
                <ul className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                  {metadataPreview.githubOwner && metadataPreview.githubRepo && (
                    <li>
                      <span className="font-medium">Repository:</span>{" "}
                      <span>
                        {metadataPreview.githubOwner}/{metadataPreview.githubRepo}
                      </span>
                    </li>
                  )}
                  {metadataPreview.githubStars != null && (
                    <li>
                      <span className="font-medium">Stars:</span>{" "}
                      <span>{new Intl.NumberFormat("en-US").format(metadataPreview.githubStars)}</span>
                    </li>
                  )}
                  {metadataPreview.githubForks != null && (
                    <li>
                      <span className="font-medium">Forks:</span>{" "}
                      <span>{new Intl.NumberFormat("en-US").format(metadataPreview.githubForks)}</span>
                    </li>
                  )}
                  {metadataPreview.githubCommitsCount != null && (
                    <li>
                      <span className="font-medium">Commits:</span>{" "}
                      <span>
                        {new Intl.NumberFormat("en-US").format(metadataPreview.githubCommitsCount)}
                      </span>
                    </li>
                  )}
                  {metadataPreview.githubBranchesCount != null && (
                    <li>
                      <span className="font-medium">Branches:</span>{" "}
                      <span>
                        {new Intl.NumberFormat("en-US").format(metadataPreview.githubBranchesCount)}
                      </span>
                    </li>
                  )}
                  {metadataPreview.githubReleasesCount != null && (
                    <li>
                      <span className="font-medium">Releases:</span>{" "}
                      <span>
                        {new Intl.NumberFormat("en-US").format(metadataPreview.githubReleasesCount)}
                      </span>
                    </li>
                  )}
                  {metadataPreview.githubOpenIssues != null && (
                    <li>
                      <span className="font-medium">Open issues:</span>{" "}
                      <span>
                        {new Intl.NumberFormat("en-US").format(metadataPreview.githubOpenIssues)}
                      </span>
                    </li>
                  )}
                  {Array.isArray(metadataPreview.githubBranches) &&
                    metadataPreview.githubBranches.length > 0 && (
                      <li>
                        <span className="font-medium">Branch names:</span>{" "}
                        <span>
                          {metadataPreview.githubBranches.slice(0, 5).join(", ")}
                          {metadataPreview.githubBranches.length > 5 &&
                            `, +${metadataPreview.githubBranches.length - 5} more`}
                        </span>
                      </li>
                    )}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowMetadataDialog(false)}
          >
            Close
          </Button>
        </div>
      </div>
    </Dialog>
    </FormProvider>
  );
};
