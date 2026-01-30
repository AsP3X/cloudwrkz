"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { updateCollection, getCollection, deleteCollection } from "@/server/actions/collections";
import { ShareCollectionDialog } from "@/components/features/links/ShareCollectionDialog";

interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
  };
}

// Predefined color options for quick selection
const COLOR_OPTIONS = [
  { value: "#3B82F6", label: "Blue" },
  { value: "#10B981", label: "Green" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#EF4444", label: "Red" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#84CC16", label: "Lime" },
  { value: "#F97316", label: "Orange" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#A855F7", label: "Violet" },
];

export function EditCollectionDialog({
  open,
  onOpenChange,
  collection,
}: EditCollectionDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState(collection.name);
  const [description, setDescription] = React.useState(collection.description || "");
  const [color, setColor] = React.useState(collection.color || "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [collectionWithMembers, setCollectionWithMembers] = React.useState<{
    members: Array<{
      id: string;
      userId: string;
      role: "VIEWER" | "EDITOR";
      user: { id: string; name: string | null; email: string };
    }>;
    owner: { id: string; name: string | null; email: string };
  } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDescription(collection.description || "");
      setColor(collection.color || "");
    }
  }, [collection]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleteError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!deleteConfirmOpen) {
      setDeleteError(null);
    }
  }, [deleteConfirmOpen]);

  const isValidHexColor = (value: string) => {
    return !value || /^#[0-9A-Fa-f]{6}$/.test(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Collection name is required");
      return;
    }

    if (color && !isValidHexColor(color)) {
      setError("Please enter a valid hex color code (e.g., #3B82F6)");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await updateCollection(collection.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        color: color.trim() || undefined,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update collection");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareClick = async () => {
    const full = await getCollection(collection.id);
    if (full?.members != null && full?.owner) {
      setCollectionWithMembers({ members: full.members, owner: full.owner });
      setShareDialogOpen(true);
    }
  };

  const handleDeleteClick = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteCollection(collection.id);
      if (result.success) {
        setDeleteConfirmOpen(false);
        onOpenChange(false);
        router.push("/dashboard/links");
        router.refresh();
      } else {
        setDeleteError(result.error || "Failed to delete collection");
      }
    } catch (err) {
      setDeleteError("An unexpected error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Collection"
      description="Update collection information and appearance"
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
              <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Collection Name <span className="text-error-600 dark:text-error-400">*</span>
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Work Resources, Personal Bookmarks"
                required
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
                placeholder="Add an optional description for this collection..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          {/* Appearance Section */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Appearance
              </h3>
            </div>

            <div>
              <label htmlFor="color" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Color
              </label>
              
              {/* Quick Color Picker */}
              <div className="mb-3">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Quick Select</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setColor(option.value)}
                      className={`
                        w-10 h-10 rounded-lg border-2 transition-all
                        ${color === option.value 
                          ? "border-neutral-900 dark:border-neutral-100 scale-110 shadow-md" 
                          : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 hover:scale-105"
                        }
                      `}
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                      aria-label={`Select ${option.label} color`}
                    />
                  ))}
                </div>
              </div>

              {/* Custom Color Input */}
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    id="color"
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#3B82F6"
                    pattern="^#[0-9A-Fa-f]{6}$"
                    className={color && !isValidHexColor(color) ? "border-error-300 dark:border-error-700" : ""}
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                    {color && !isValidHexColor(color) ? (
                      <span className="text-error-600 dark:text-error-400">Invalid hex color format</span>
                    ) : (
                      "Enter a custom hex color code (e.g., #3B82F6) or leave empty to remove color"
                    )}
                  </p>
                </div>
                {color && isValidHexColor(color) && (
                  <div
                    className="w-12 h-12 rounded-lg border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: color }}
                    title="Selected color"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Share & Delete Section */}
        <div className="space-y-4 pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
              Sharing &amp; deletion
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={handleShareClick} disabled={isSubmitting}>
              Share with others
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isSubmitting}
              className="text-error-600 dark:text-error-400 border-error-300 dark:border-error-700 hover:bg-error-50 dark:hover:bg-error-950/30"
            >
              Delete collection
            </Button>
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
              "Update Collection"
            )}
          </Button>
        </div>
      </form>

      {collectionWithMembers && (
        <ShareCollectionDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          collectionId={collection.id}
          members={collectionWithMembers.members}
          owner={collectionWithMembers.owner}
        />
      )}

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete collection"
        description="This will permanently delete the collection and remove it from all links. This action cannot be undone."
        className="max-w-md"
      >
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
          {deleteError && (
            <div className="p-3 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{deleteError}</p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="bg-error-600 hover:bg-error-700 dark:bg-error-500 dark:hover:bg-error-600 text-white border-error-600 dark:border-error-500"
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deleting...
                </span>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}
