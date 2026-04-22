import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { type LinkViewMode } from "../LinkViewContext";
import { api } from "@/api/client";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { EditLinkDialog } from "@/components/features/links/EditLinkDialog/EditLinkDialog";

// Human: React UI for `LinkList` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS LinkList; REACT component; READS props hooks; MAY CALL api client.
type LinkItem = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  favicon: string | null;
  link_type: string;
  tags: string[];
  notes: string | null;
  is_favorite: boolean;
  rating: number | null;
  created_at: string;
  updated_at: string;
  user_id?: string;
  collections: Array<{
    collection: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

interface LinkListProps {
  links: LinkItem[];
  viewMode: LinkViewMode;
  isArchivePage?: boolean;
  currentUserId?: string;
  isSharedWithMeView?: boolean;
  onRefresh?: () => void;
}

function extractDomain(url: string): string {
  try {
    let urlToParse = url;
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }
    const urlObj = new URL(urlToParse);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[0].replace(/^www\./, "");
  }
}

const getLinkTypeColor = (type: string) => {
  switch (type) {
    case "WEBSITE":
      return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
    case "FILE":
      return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
    case "DOCUMENT":
      return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
    case "VIDEO":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "IMAGE":
      return "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
};

const COLLECTION_COLOR_OPTIONS = [
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

const isValidHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

const getLinkTypeLabel = (type: string) => {
  switch (type) {
    case "WEBSITE":
      return "Website";
    case "FILE":
      return "File";
    case "DOCUMENT":
      return "Document";
    case "VIDEO":
      return "Video";
    case "IMAGE":
      return "Image";
    default:
      return "Other";
  }
};

export const LinkList = ({
  links,
  viewMode,
  isArchivePage = false,
  currentUserId,
  isSharedWithMeView = false,
  onRefresh,
}: LinkListProps) => {
  const navigate = useNavigate();
  const [selectedLinks, setSelectedLinks] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showCollectionDialog, setShowCollectionDialog] = React.useState(false);
  const [collectionDialogMode, setCollectionDialogMode] = React.useState<"add" | "create">("add");
  const [selectedCollectionId, setSelectedCollectionId] = React.useState("");
  const [newCollectionName, setNewCollectionName] = React.useState("");
  const [newCollectionColor, setNewCollectionColor] = React.useState("");
  const [collections, setCollections] = React.useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [loadingCollections, setLoadingCollections] = React.useState(false);
  const [collectionError, setCollectionError] = React.useState<string | null>(null);
  const [newCollectionError, setNewCollectionError] = React.useState<string | null>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; link: LinkItem } | null>(null);
  const [editDialogLink, setEditDialogLink] = React.useState<LinkItem | null>(null);

  React.useEffect(() => {
    if (showCollectionDialog) {
      setLoadingCollections(true);
      setCollectionError(null);
      setNewCollectionError(null);
      setSelectedCollectionId("");
      setNewCollectionName("");
      setNewCollectionColor("");
      setCollectionDialogMode("add");
      api
        .get<{ collections: Array<{ id: string; name: string; color: string | null }> }>("/collections")
        .then((res) => {
          const cols = res.collections ?? [];
          setCollections(cols);
          setCollectionDialogMode(cols.length === 0 ? "create" : "add");
        })
        .catch(() => setCollectionError("Failed to load collections"))
        .finally(() => setLoadingCollections(false));
    }
  }, [showCollectionDialog]);

  const allSelected = links.length > 0 && selectedLinks.size === links.length;
  const someSelected = selectedLinks.size > 0 && selectedLinks.size < links.length;

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLinks(new Set(links.map((l) => l.id)));
    } else {
      setSelectedLinks(new Set());
    }
  };

  const handleSelectLink = (linkId: string, checked: boolean) => {
    const newSelected = new Set(selectedLinks);
    if (checked) {
      newSelected.add(linkId);
    } else {
      newSelected.delete(linkId);
    }
    setSelectedLinks(newSelected);
  };

  const handleBulkArchive = async () => {
    if (selectedLinks.size === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.post("/links/bulk/archive", { link_ids: Array.from(selectedLinks) });
      setSelectedLinks(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive links");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedLinks.size === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      await api.post("/links/bulk/unarchive", { link_ids: Array.from(selectedLinks) });
      setSelectedLinks(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unarchive links");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedLinks.size === 0) return;
    setShowDeleteDialog(true);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedLinks.size === 0) return;
    setIsProcessing(true);
    setError(null);
    try {
      if (isSharedWithMeView) {
        await api.post("/links/bulk/remove-shared", { link_ids: Array.from(selectedLinks) });
      } else {
        await api.post("/links/bulk/delete", { link_ids: Array.from(selectedLinks) });
      }
      setSelectedLinks(new Set());
      setShowDeleteDialog(false);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isSharedWithMeView ? "Failed to remove from Shared with me" : "Failed to delete links"));
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedLinks(new Set());
    setError(null);
  };

  const handleSingleArchive = React.useCallback(
    async (linkId: string) => {
      setContextMenu(null);
      setIsProcessing(true);
      setError(null);
      try {
        await api.post("/links/bulk/archive", { link_ids: [linkId] });
        onRefresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to archive link");
      } finally {
        setIsProcessing(false);
      }
    },
    [onRefresh]
  );

  const handleSingleUnarchive = React.useCallback(
    async (linkId: string) => {
      setContextMenu(null);
      setIsProcessing(true);
      setError(null);
      try {
        await api.post("/links/bulk/unarchive", { link_ids: [linkId] });
        onRefresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unarchive link");
      } finally {
        setIsProcessing(false);
      }
    },
    [onRefresh]
  );

  const handleOpenDeleteForLink = React.useCallback((linkId: string) => {
    setContextMenu(null);
    setSelectedLinks(new Set([linkId]));
    setShowDeleteDialog(true);
  }, []);

  const getLinkContextMenuItems = React.useCallback(
    (link: LinkItem): OverviewContextMenuItem[] => {
      const isOwn = currentUserId && link.user_id === currentUserId;
      const items: OverviewContextMenuItem[] = [
        {
          id: "open",
          label: "Open",
          onClick: () => {
            setContextMenu(null);
            navigate(`/dashboard/links/${link.id}`);
          },
        },
      ];
      if (isOwn) {
        items.push(
          {
            id: "edit",
            label: "Edit",
            onClick: () => {
              setContextMenu(null);
              setEditDialogLink(link);
            },
          },
          {
            id: "share",
            label: "Share",
            onClick: () => {
              setContextMenu(null);
            },
          }
        );
      }
      if (isSharedWithMeView) {
        items.push({
          id: "add-to-collection",
          label: "Add to my collection",
          onClick: () => {
            setContextMenu(null);
          },
          separatorAbove: !!isOwn,
        });
      }
      if (isOwn && !isSharedWithMeView) {
        items.push(
          {
            id: isArchivePage ? "unarchive" : "archive",
            label: isArchivePage ? "Unarchive" : "Archive",
            onClick: () => (isArchivePage ? handleSingleUnarchive(link.id) : handleSingleArchive(link.id)),
            disabled: isProcessing,
            separatorAbove: true,
          },
          {
            id: "delete",
            label: isArchivePage ? "Delete permanently" : "Delete",
            onClick: () => handleOpenDeleteForLink(link.id),
            disabled: isProcessing,
            destructive: true,
          }
        );
      }
      if (isSharedWithMeView) {
        items.push({
          id: "remove-shared",
          label: "Remove from Shared with me",
          onClick: () => handleOpenDeleteForLink(link.id),
          disabled: isProcessing,
          destructive: true,
          separatorAbove: true,
        });
      }
      return items;
    },
    [
      currentUserId,
      isSharedWithMeView,
      isArchivePage,
      isProcessing,
      navigate,
      handleSingleArchive,
      handleSingleUnarchive,
      handleOpenDeleteForLink,
    ]
  );

  const handleCollectionClick = () => {
    if (selectedLinks.size === 0) return;
    setShowCollectionDialog(true);
  };

  const handleCollectionDialogModeChange = (mode: "add" | "create") => {
    setCollectionDialogMode(mode);
    setCollectionError(null);
    setNewCollectionError(null);
  };

  const handleAddToCollectionSubmit = async () => {
    if (!selectedCollectionId || selectedLinks.size === 0) return;
    setIsProcessing(true);
    setCollectionError(null);
    try {
      await api.post("/links/bulk/add-to-collection", {
        link_ids: Array.from(selectedLinks),
        collection_id: selectedCollectionId,
      });
      setShowCollectionDialog(false);
      setSelectedCollectionId("");
      setSelectedLinks(new Set());
      onRefresh?.();
    } catch (err) {
      setCollectionError(err instanceof Error ? err.message : "Failed to add to collection");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewCollectionSubmit = async () => {
    if (selectedLinks.size === 0) return;
    const name = newCollectionName.trim();
    if (!name) {
      setNewCollectionError("Collection name is required");
      return;
    }
    if (newCollectionColor && !isValidHexColor(newCollectionColor)) {
      setNewCollectionError("Please enter a valid hex color code (e.g., #3B82F6)");
      return;
    }
    setIsProcessing(true);
    setNewCollectionError(null);
    try {
      await api.post("/links/bulk/create-collection", {
        link_ids: Array.from(selectedLinks),
        name,
        color: newCollectionColor.trim() || undefined,
      });
      setShowCollectionDialog(false);
      setNewCollectionName("");
      setSelectedLinks(new Set());
      onRefresh?.();
    } catch (err) {
      setNewCollectionError(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setIsProcessing(false);
    }
  };

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {selectedLinks.size > 0 && (
        <>
          <div className="px-6 py-3 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                  {selectedLinks.size} link{selectedLinks.size !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={handleClearSelection}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                {!isArchivePage && !isSharedWithMeView && (
                  <button
                    onClick={handleCollectionClick}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md disabled:opacity-50"
                  >
                    Collection
                  </button>
                )}
                {!isSharedWithMeView && (isArchivePage ? (
                  <button
                    onClick={handleBulkUnarchive}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md disabled:opacity-50"
                  >
                    Unarchive
                  </button>
                ) : (
                  <button
                    onClick={handleBulkArchive}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md disabled:opacity-50"
                  >
                    Archive
                  </button>
                ))}
                <button
                  onClick={handleBulkDelete}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded-md disabled:opacity-50"
                >
                  {isSharedWithMeView ? "Remove from Shared with me" : isArchivePage ? "Delete permanently" : "Delete"}
                </button>
              </div>
            </div>
          </div>
          {error && (
            <div className="px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
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
                <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
              </div>
            </div>
          )}
        </>
      )}
      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getLinkContextMenuItems(contextMenu.link) : []}
      />

      <EditLinkDialog
        open={!!editDialogLink}
        onOpenChange={(next) => {
          if (!next) setEditDialogLink(null);
        }}
        link={
          editDialogLink
            ? {
                id: editDialogLink.id,
                title: editDialogLink.title,
                url: editDialogLink.url,
                description: editDialogLink.description,
                collections: editDialogLink.collections,
              }
            : null
        }
        onSuccess={() => onRefresh?.()}
      />

      {/* Card View */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-4 md:p-5">
          {links.map((link) => {
            const isSelected = selectedLinks.has(link.id);
            const domain = extractDomain(link.url);

            return (
              <div
                key={link.id}
                className={cn(
                  "group relative flex h-full flex-col rounded-xl border border-neutral-200/80 bg-white/80 p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary-100 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/80 dark:hover:border-primary-900/60",
                  isSelected &&
                    "ring-2 ring-primary-500/80 border-primary-500 shadow-md dark:ring-primary-500/70"
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, link });
                }}
              >
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex flex-1 items-start gap-3 min-w-0">
                    {link.favicon && (
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-neutral-50 ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-neutral-700">
                        <img
                          src={link.favicon}
                          alt=""
                          width={20}
                          height={20}
                          className="h-5 w-5 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link
                        to={`/dashboard/links/${link.id}`}
                        className="block text-sm font-semibold text-neutral-900 transition-colors hover:text-primary-600 dark:text-neutral-100 dark:hover:text-primary-400 line-clamp-2"
                      >
                        {link.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:text-primary-600 dark:hover:text-primary-400"
                        >
                          {domain}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectLink(link.id, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-primary-600 shadow-sm focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900"
                      aria-label={`Select ${link.title}`}
                    />
                    {link.is_favorite && (
                      <svg
                        className="h-4 w-4 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                  </div>
                </div>

                {link.description && (
                  <p className="mb-3 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3">
                    {link.description}
                  </p>
                )}

                {(link.tags.length > 0 || link.collections.length > 0 || link.notes || link.rating) && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {link.rating && (
                      <div className="mr-1 flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={cn(
                              "h-3 w-3",
                              star <= link.rating!
                                ? "text-amber-400 fill-current"
                                : "text-neutral-300 dark:text-neutral-600"
                            )}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    )}

                    {link.tags.length > 0 && (
                      <>
                        {link.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} className="rounded-full px-2 py-0.5 text-[11px]">
                            {tag}
                          </Badge>
                        ))}
                        {link.tags.length > 3 && (
                          <Badge className="rounded-full px-2 py-0.5 text-[11px]">
                            +{link.tags.length - 3}
                          </Badge>
                        )}
                      </>
                    )}

                    {link.collections.length > 0 && (
                      <>
                        {link.collections.slice(0, 2).map((lc) => (
                          <Badge
                            key={lc.collection.id}
                            className="rounded-full px-2 py-0.5 text-[11px]"
                            style={{
                              backgroundColor: lc.collection.color
                                ? `${lc.collection.color}20`
                                : undefined,
                              color: lc.collection.color || undefined,
                            }}
                          >
                            {lc.collection.name}
                          </Badge>
                        ))}
                        {link.collections.length > 2 && (
                          <Badge className="rounded-full px-2 py-0.5 text-[11px]">
                            +{link.collections.length - 2}
                          </Badge>
                        )}
                      </>
                    )}

                    {link.notes && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        <span>Has notes</span>
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-neutral-500 dark:text-neutral-400 border-t border-dashed border-neutral-200/70 dark:border-neutral-800">
                  <span>{formatDate(link.created_at)}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-600 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-primary-400 dark:hover:border-primary-800 dark:hover:bg-primary-950/40"
                      title="Open link in new tab"
                    >
                      Open
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {links.map((link) => {
            const isSelected = selectedLinks.has(link.id);
            const domain = extractDomain(link.url);

            return (
              <div
                key={link.id}
                className={cn(
                  "p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
                  isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, link });
                }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectLink(link.id, e.target.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer flex-shrink-0"
                    aria-label={`Select ${link.title}`}
                  />
                  {link.favicon && (
                    <img
                      src={link.favicon}
                      alt=""
                      width={20}
                      height={20}
                      className="w-5 h-5 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/dashboard/links/${link.id}`}
                        className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 truncate"
                      >
                        {link.title}
                      </Link>
                      {link.is_favorite && (
                        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                      {link.rating && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <svg
                              key={star}
                              className={cn(
                                "w-3 h-3",
                                star <= link.rating!
                                  ? "text-yellow-500 fill-current"
                                  : "text-neutral-300 dark:text-neutral-600"
                              )}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 truncate block"
                      >
                        {domain}
                      </a>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
                        title="Open link in new tab"
                      >
                        Open
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn(getLinkTypeColor(link.link_type), "text-[10px] px-1.5 py-0.5")}>
                        {getLinkTypeLabel(link.link_type)}
                      </Badge>
                      {link.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} className="text-[10px] px-1.5 py-0.5">
                          {tag}
                        </Badge>
                      ))}
                      {link.tags.length > 2 && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          +{link.tags.length - 2}
                        </span>
                      )}
                      {link.notes && (
                        <svg className="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      )}
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatDate(link.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                    aria-label="Select all links"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                  Tags
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                  Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {links.map((link) => {
                const isSelected = selectedLinks.has(link.id);
                const domain = extractDomain(link.url);

                return (
                  <tr
                    key={link.id}
                    className={cn("hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors", isSelected && "bg-primary-50 dark:bg-primary-900/20")}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, link });
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectLink(link.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                        aria-label={`Select link ${link.title}`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {link.favicon && (
                          <img
                            src={link.favicon}
                            alt=""
                            width={20}
                            height={20}
                            className="w-5 h-5 flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/dashboard/links/${link.id}`}
                              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 truncate"
                            >
                              {link.title}
                            </Link>
                            {link.is_favorite && (
                              <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            )}
                            {link.notes && (
                              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            )}
                          </div>
                          {link.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                              {link.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 truncate block max-w-md"
                        >
                          {domain}
                        </a>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1 whitespace-nowrap"
                          title="Open link in new tab"
                        >
                          Open
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <Badge className={getLinkTypeColor(link.link_type)}>
                        {getLinkTypeLabel(link.link_type)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {link.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {link.tags.length > 2 && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            +{link.tags.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      {link.rating ? (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <svg
                              key={star}
                              className={cn(
                                "w-4 h-4",
                                star <= link.rating!
                                  ? "text-yellow-500 fill-current"
                                  : "text-neutral-300 dark:text-neutral-600"
                              )}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(link.created_at)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {isSharedWithMeView ? "Remove from Shared with me" : isArchivePage ? "Delete permanently" : "Delete Links"}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {isSharedWithMeView
                ? `Remove ${selectedLinks.size} link${selectedLinks.size !== 1 ? "s" : ""} from your list? The owner and others will not be affected.`
                : `Are you sure you want to ${isArchivePage ? "permanently delete" : "delete"} ${selectedLinks.size} link${selectedLinks.size !== 1 ? "s" : ""}? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-error-600 hover:bg-error-700 rounded-md disabled:opacity-50"
              >
                {isProcessing ? (isSharedWithMeView ? "Removing..." : "Deleting...") : isSharedWithMeView ? "Remove" : isArchivePage ? "Delete permanently" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={showCollectionDialog}
        onOpenChange={setShowCollectionDialog}
        title="Add to collection"
        description={`Choose how to add ${selectedLinks.size} selected link${selectedLinks.size !== 1 ? "s" : ""} to a collection.`}
      >
        <div className="px-4 sm:px-6 pb-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => !loadingCollections && collections.length > 0 && handleCollectionDialogModeChange("add")}
              disabled={loadingCollections || collections.length === 0}
              className={cn(
                "rounded-lg border-2 p-4 text-left transition-all",
                collectionDialogMode === "add"
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-500"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600",
                (loadingCollections || collections.length === 0) && "opacity-60 cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    collectionDialogMode === "add"
                      ? "bg-primary-100 dark:bg-primary-800/50 text-primary-600 dark:text-primary-400"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  )}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 block">
                    Add to existing
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 block">
                    {collections.length === 0 && !loadingCollections
                      ? "No collections yet"
                      : "Put links into a collection you already have"}
                  </span>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleCollectionDialogModeChange("create")}
              className={cn(
                "rounded-lg border-2 p-4 text-left transition-all",
                collectionDialogMode === "create"
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-500"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    collectionDialogMode === "create"
                      ? "bg-primary-100 dark:bg-primary-800/50 text-primary-600 dark:text-primary-400"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                  )}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 block">
                    Create new collection
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 block">
                    Create a collection and add these links to it
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 p-4">
            {loadingCollections ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 py-2">Loading collections...</p>
            ) : collectionDialogMode === "add" ? (
              <div className="space-y-3">
                <Select
                  label="Choose collection"
                  options={collections.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select a collection"
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                />
                {collectionError && (
                  <p className="text-sm text-error-600 dark:text-error-400">{collectionError}</p>
                )}
                {collections.length === 0 && (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    You don&apos;t have any collections yet. Choose &quot;Create new collection&quot; above.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Input
                  label="Collection name"
                  name="newCollectionName"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="e.g. Research, Bookmarks, Work"
                  autoFocus
                />
                <div>
                  <label htmlFor="newCollectionColor" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    Color
                  </label>
                  <div className="mb-2">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Quick select</p>
                    <div className="flex flex-wrap gap-2">
                      {COLLECTION_COLOR_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setNewCollectionColor(option.value)}
                          className={cn(
                            "w-9 h-9 rounded-lg border-2 transition-all",
                            newCollectionColor === option.value
                              ? "border-neutral-900 dark:border-neutral-100 scale-110 shadow-md"
                              : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 hover:scale-105"
                          )}
                          style={{ backgroundColor: option.value }}
                          title={option.label}
                          aria-label={`Select ${option.label} color`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <Input
                        id="newCollectionColor"
                        type="text"
                        name="newCollectionColor"
                        value={newCollectionColor}
                        onChange={(e) => setNewCollectionColor(e.target.value)}
                        placeholder="#3B82F6"
                        className={newCollectionColor && !isValidHexColor(newCollectionColor) ? "border-error-300 dark:border-error-700" : ""}
                      />
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                        {newCollectionColor && !isValidHexColor(newCollectionColor) ? (
                          <span className="text-error-600 dark:text-error-400">Invalid hex color format</span>
                        ) : (
                          "Or enter a custom hex color (e.g., #3B82F6)"
                        )}
                      </p>
                    </div>
                    {newCollectionColor && isValidHexColor(newCollectionColor) && (
                      <div
                        className="w-10 h-10 rounded-lg border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0"
                        style={{ backgroundColor: newCollectionColor }}
                        title="Selected color"
                      />
                    )}
                  </div>
                </div>
                {newCollectionError && (
                  <p className="text-sm text-error-600 dark:text-error-400">{newCollectionError}</p>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  A new collection will be created and {selectedLinks.size} link{selectedLinks.size !== 1 ? "s" : ""} will be added to it.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <button
              onClick={() => setShowCollectionDialog(false)}
              className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
            >
              Cancel
            </button>
            {collectionDialogMode === "add" ? (
              <button
                onClick={handleAddToCollectionSubmit}
                disabled={isProcessing || loadingCollections || !selectedCollectionId || collections.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
              >
                {isProcessing ? "Adding..." : "Add to collection"}
              </button>
            ) : (
              <button
                onClick={handleNewCollectionSubmit}
                disabled={
                  isProcessing ||
                  !newCollectionName.trim() ||
                  (newCollectionColor.length > 0 && !isValidHexColor(newCollectionColor))
                }
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
              >
                {isProcessing ? "Creating..." : "Create collection"}
              </button>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
};
