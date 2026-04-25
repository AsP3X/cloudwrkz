import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { ShareCollectionDialog, type CollectionMemberRow } from "@/components/features/links/ShareCollectionDialog/ShareCollectionDialog";

// Human: React UI for `EditCollectionDialog` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS EditCollectionDialog; REACT component; READS props hooks; MAY CALL api client.
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

interface EditCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    description?: string | null;
    color?: string | null;
  };
  isOwner?: boolean;
  onUpdated?: () => void;
}

function isValidHexColor(value: string): boolean {
  return !value || /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function EditCollectionDialog({
  open,
  onOpenChange,
  collection,
  isOwner = true,
  onUpdated,
}: EditCollectionDialogProps) {
  const navigate = useNavigate();
  const [name, setName] = React.useState(collection.name);
  const [description, setDescription] = React.useState(collection.description ?? "");
  const [color, setColor] = React.useState(collection.color ?? "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [isRemovingShare, setIsRemovingShare] = React.useState(false);
  const [removeShareError, setRemoveShareError] = React.useState<string | null>(null);
  const [sharePayload, setSharePayload] = React.useState<{
    members: CollectionMemberRow[];
    owner: { id: string; name: string | null; email: string };
  } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(collection.name);
    setDescription(collection.description || "");
    setColor(collection.color || "");
  }, [collection]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setDeleteError(null);
      setRemoveShareError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!deleteConfirmOpen) {
      setDeleteError(null);
    }
  }, [deleteConfirmOpen]);

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
      await api.put(`/collections/${collection.id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
        color: color.trim() || undefined,
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to update collection";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareClick = async () => {
    try {
      const full = await api.get<{
        collection: {
          members?: CollectionMemberRow[];
          owner?: { id: string; name: string | null; email: string };
        };
      }>(`/collections/${collection.id}`);
      const m = full.collection?.members ?? [];
      const o = full.collection?.owner;
      if (o) {
        setSharePayload({ members: m, owner: o });
        setShareDialogOpen(true);
      }
    } catch {
      setError("Could not load sharing details");
    }
  };

  const handleDeleteClick = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/collections/${collection.id}`);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      navigate(`${ROUTES.LINKS}`);
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to delete collection";
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveShareClick = async () => {
    setIsRemovingShare(true);
    setRemoveShareError(null);
    try {
      await api.post(`/collections/${collection.id}/leave`, {});
      onOpenChange(false);
      navigate(`${ROUTES.LINKS}`);
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to remove share";
      setRemoveShareError(msg);
    } finally {
      setIsRemovingShare(false);
    }
  };

  if (!isOwner) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Remove share"
        description="Remove this collection from your list. The owner and other members will not be affected."
        className="max-w-md"
      >
        <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            &quot;{collection.name}&quot; will be removed from your collections. Only your access is removed; the owner and other
            members are not affected.
          </p>
          {removeShareError && (
            <div className="p-3 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{removeShareError}</p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isRemovingShare}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleRemoveShareClick} disabled={isRemovingShare}>
              {isRemovingShare ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Removing...
                </span>
              ) : (
                "Remove share"
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

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
          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">Basic Information</h3>
            </div>

            <div>
              <label htmlFor="ec-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Collection Name <span className="text-error-600 dark:text-error-400">*</span>
              </label>
              <Input id="ec-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div>
              <label htmlFor="ec-desc" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Description
              </label>
              <Textarea
                id="ec-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">Appearance</h3>
            </div>

            <div>
              <label htmlFor="ec-color" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Color</label>
              <div className="mb-3">
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Quick Select</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setColor(option.value)}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${
                        color === option.value
                          ? "border-neutral-900 dark:border-neutral-100 scale-110 shadow-md"
                          : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 hover:scale-105"
                      }`}
                      style={{ backgroundColor: option.value }}
                      title={option.label}
                      aria-label={`Select ${option.label} color`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    id="ec-color"
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#3B82F6"
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

        <div className="space-y-4 pt-6 border-t border-neutral-200 dark:border-neutral-800">
          <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">Sharing &amp; deletion</h3>
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

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update Collection"}
          </Button>
        </div>
      </form>

      {sharePayload && (
        <ShareCollectionDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          collectionId={collection.id}
          members={sharePayload.members}
          owner={sharePayload.owner}
          onUpdated={() => onUpdated?.()}
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
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  );
}
