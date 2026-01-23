"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateLink, extractLinkMetadataAction } from "@/server/actions/links";
import { formatLinkUrl, validateUrl } from "@/lib/utils/links";
import { formatDate } from "@/lib/utils/date";

interface EditLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    metadataExtractedAt: Date | null;
  };
}

export function EditLinkDialog({ open, onOpenChange, link }: EditLinkDialogProps) {
  const router = useRouter();
  const [url, setUrl] = React.useState(link.url);
  const [title, setTitle] = React.useState(link.title);
  const [description, setDescription] = React.useState(link.description || "");
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
      setLinkType(link.linkType as any);
      setTags(link.tags);
      setNotes(link.notes || "");
      setIsFavorite(link.isFavorite);
      setRating(link.rating);
      setSelectedCollections(link.collections.map((c) => c.collection.id));
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
      }
    } catch (error) {
      setError("Failed to extract metadata");
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
        linkType,
        tags,
        notes: notes.trim() || undefined,
        isFavorite,
        rating: rating || undefined,
        collectionIds: selectedCollections,
        extractMetadata: url !== link.url, // Extract if URL changed
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update link");
      }
    } catch (err) {
      setError("An unexpected error occurred");
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
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Title
            </label>
            <button
              type="button"
              onClick={handleRefreshMetadata}
              disabled={extractingMetadata}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
            >
              {extractingMetadata ? "Extracting..." : "Refresh Metadata"}
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
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Metadata extracted: {formatDate(link.metadataExtractedAt)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Link description"
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
            {isSubmitting ? "Updating..." : "Update Link"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
