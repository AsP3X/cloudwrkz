"use client";

import React from "react";
import { useForm, FormProvider } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateLink, extractLinkMetadataAction } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";

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
  const [hoveredRating, setHoveredRating] = React.useState<number | null>(null);

  const methods = useForm({
    defaultValues: {
      url: link.url,
      title: link.title,
      description: link.description || "",
      notes: link.notes || "",
      linkType: link.linkType as "WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER",
      rating: link.rating?.toString() || "",
      isFavorite: link.isFavorite,
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

    try {
      const result = await extractLinkMetadataAction(formattedUrl);
      if (result.success && result.data) {
        if (result.data.title) {
          setValue("title", result.data.title);
        }
        if (result.data.description) {
          setValue("description", result.data.description);
        }
      }
    } catch (error) {
      setServerError("Failed to extract metadata");
    } finally {
      setExtractingMetadata(false);
    }
  };

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
        linkType: data.linkType,
        tags,
        notes: data.notes || undefined,
        isFavorite: data.isFavorite,
        rating: data.rating ? parseInt(data.rating) : undefined,
        collectionIds: selectedCollections,
        extractMetadata: url !== link.url, // Extract if URL changed
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

      {/* URL Field */}
      <Input
        label="URL"
        type="url"
        placeholder="https://example.com"
        error={errors.url?.message as string}
        helperText="The web address for this link"
        required
        {...register("url", { required: "URL is required" })}
      />

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

      {/* Tags Field */}
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

      {/* Collections Field */}
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

      {/* Favorite Checkbox */}
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          {...register("isFavorite")}
          className="w-4 h-4 text-primary-600 dark:text-primary-400 rounded border-neutral-300 dark:border-neutral-600 focus:ring-primary-500 focus:ring-2"
        />
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 cursor-pointer">
          Mark as Favorite
        </label>
      </div>

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
    </FormProvider>
  );
};
