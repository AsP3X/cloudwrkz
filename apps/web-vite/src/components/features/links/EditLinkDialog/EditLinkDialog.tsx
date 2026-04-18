import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import type { Link as LinkType } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

export interface EditLinkDialogLink {
  id: string;
  title: string;
  url: string;
  description: string | null;
  collections?: LinkType["collections"];
}

type CollectionRow = { id: string; name: string; color: string | null };

function collectionMeta(
  id: string,
  linkCollections: EditLinkDialogLink["collections"],
  allCollections: CollectionRow[]
): CollectionRow {
  const fromAll = allCollections.find((c) => c.id === id);
  if (fromAll) return fromAll;
  const fromLink = linkCollections?.find((c) => c.collection.id === id)?.collection;
  if (fromLink) return { id: fromLink.id, name: fromLink.name, color: fromLink.color };
  return { id, name: "Collection", color: null };
}

interface EditLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: EditLinkDialogLink | null;
  onSuccess?: () => void;
}

export function EditLinkDialog({ open, onOpenChange, link, onSuccess }: EditLinkDialogProps) {
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignedCollectionIds, setAssignedCollectionIds] = React.useState<string[]>([]);
  const [allCollections, setAllCollections] = React.useState<CollectionRow[]>([]);
  const [loadingCollectionsList, setLoadingCollectionsList] = React.useState(false);
  const [loadingLinkCollections, setLoadingLinkCollections] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const linkId = link?.id;

  React.useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      return;
    }
    if (!link) return;
    setTitle(link.title);
    setUrl(link.url);
    setDescription(link.description ?? "");
    setError(null);
    setPickerOpen(false);
    if (link.collections !== undefined) {
      setAssignedCollectionIds(link.collections.map((c) => c.collection.id));
    } else {
      setAssignedCollectionIds([]);
    }
  }, [open, link?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- sync only on open / link id

  React.useEffect(() => {
    if (!open || !linkId) return;
    if (link?.collections !== undefined) return;
    let cancelled = false;
    setLoadingLinkCollections(true);
    api
      .get<{ link: LinkType }>(`/links/${linkId}`)
      .then((res) => {
        if (cancelled) return;
        setAssignedCollectionIds(res.link.collections?.map((c) => c.collection.id) ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssignedCollectionIds([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLinkCollections(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, linkId, link?.collections]);

  React.useEffect(() => {
    if (!open) return;
    setLoadingCollectionsList(true);
    api
      .get<{ collections: CollectionRow[] }>("/collections")
      .then((res) => setAllCollections(res.collections ?? []))
      .catch(() => setAllCollections([]))
      .finally(() => setLoadingCollectionsList(false));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;
    setError(null);
    setSaving(true);
    try {
      await api.put(`/links/${link.id}`, {
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
        collection_ids: assignedCollectionIds,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to update link."
      );
    } finally {
      setSaving(false);
    }
  };

  const removeCollection = (id: string) => {
    setAssignedCollectionIds((prev) => prev.filter((x) => x !== id));
  };

  const addCollection = (id: string) => {
    setAssignedCollectionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPickerOpen(false);
  };

  const availableToAdd = allCollections.filter((c) => !assignedCollectionIds.includes(c.id));

  if (!link) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Edit Link"
        description="Update details and collection assignments"
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
          )}

          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input label="URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <div>
            <label htmlFor="edit-link-description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Description
            </label>
            <Textarea
              id="edit-link-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="min-h-[120px] resize-y"
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="pb-1 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">Collections</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Remove or add which collections include this link.</p>
            </div>

            {loadingLinkCollections ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading assignments…
              </div>
            ) : assignedCollectionIds.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">This link is not in any collection.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {assignedCollectionIds.map((cid) => {
                  const meta = collectionMeta(cid, link.collections, allCollections);
                  const hasColor = meta.color && /^#[0-9A-Fa-f]{6}$/.test(meta.color);
                  return (
                    <li
                      key={cid}
                      className={cn(
                        "inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-sm font-medium border",
                        !hasColor && "bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200"
                      )}
                      style={
                        hasColor && meta.color
                          ? {
                              backgroundColor: `${meta.color}18`,
                              borderColor: meta.color,
                              color: meta.color,
                            }
                          : undefined
                      }
                    >
                      <span className="max-w-[200px] truncate">{meta.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCollection(cid)}
                        className={cn(
                          "p-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10",
                          hasColor && meta.color && "opacity-90"
                        )}
                        aria-label={`Remove from ${meta.name}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
                disabled={loadingCollectionsList || availableToAdd.length === 0}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to collection
              </Button>
              {!loadingCollectionsList && allCollections.length > 0 && availableToAdd.length === 0 && assignedCollectionIds.length > 0 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">This link is already in all of your collections.</p>
              )}
              {!loadingCollectionsList && allCollections.length === 0 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">Create a collection from the links page first.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={saving || loadingLinkCollections}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      {pickerOpen && (
        <Dialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Add to collection"
          description="Choose a collection to add this link to"
          className="max-w-md"
          nested
        >
          <div className="p-6 max-h-96 overflow-y-auto">
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-4">No more collections to add.</p>
            ) : (
              <div className="space-y-2">
                {availableToAdd.map((c) => {
                  const hasColor = c.color && /^#[0-9A-Fa-f]{6}$/.test(c.color);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => addCollection(c.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left"
                    >
                      {hasColor && (
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: c.color! }} />
                      )}
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 flex-1">{c.name}</span>
                      <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button variant="outline" type="button" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
