"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { type LinkViewMode } from "../LinkViewContext";
import {
  bulkDeleteLinks,
  bulkArchiveLinks,
  bulkUnarchiveLinks,
  bulkAddLinksToCollection,
  bulkCreateCollectionWithLinks,
} from "@/server/actions/links";
import { getUserCollections } from "@/server/actions/collections";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { extractDomain } from "@/lib/utils/links";

type LinkItem = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  favicon: string | null;
  linkType: string;
  tags: string[];
  notes: string | null;
  isFavorite: boolean;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
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
  /** When true, show Unarchive and Delete permanently instead of Archive and Delete */
  isArchivePage?: boolean;
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

// Predefined color options for collection creation (matches CreateCollectionDialog)
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

export const LinkList = ({ links, viewMode, isArchivePage = false }: LinkListProps) => {
  const router = useRouter();
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (showCollectionDialog) {
      setLoadingCollections(true);
      setCollectionError(null);
      setNewCollectionError(null);
      setSelectedCollectionId("");
      setNewCollectionName("");
      setNewCollectionColor("");
      setCollectionDialogMode("add");
      getUserCollections("")
        .then((cols) => {
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
      const result = await bulkArchiveLinks(Array.from(selectedLinks));
      if (result.success) {
        setSelectedLinks(new Set());
        router.refresh();
      } else {
        setError(result.error || "Failed to archive links");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedLinks.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkUnarchiveLinks(Array.from(selectedLinks));
      if (result.success) {
        setSelectedLinks(new Set());
        router.refresh();
      } else {
        setError(result.error || "Failed to unarchive links");
      }
    } catch (err) {
      setError("An unexpected error occurred");
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
      const result = await bulkDeleteLinks(Array.from(selectedLinks));
      if (result.success) {
        setSelectedLinks(new Set());
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to delete links");
        setShowDeleteDialog(false);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedLinks(new Set());
    setError(null);
  };

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
      const result = await bulkAddLinksToCollection(Array.from(selectedLinks), selectedCollectionId);
      if (result.success) {
        setShowCollectionDialog(false);
        setSelectedCollectionId("");
        setSelectedLinks(new Set());
        router.refresh();
      } else {
        setCollectionError(result.error || "Failed to add to collection");
      }
    } catch (err) {
      setCollectionError("An unexpected error occurred");
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
      const result = await bulkCreateCollectionWithLinks(
        Array.from(selectedLinks),
        name,
        newCollectionColor.trim() || undefined
      );
      if (result.success) {
        setShowCollectionDialog(false);
        setNewCollectionName("");
        setSelectedLinks(new Set());
        router.refresh();
      } else {
        setNewCollectionError(result.error || "Failed to create collection");
      }
    } catch (err) {
      setNewCollectionError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden" suppressHydrationWarning>
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
                {!isArchivePage && (
                  <button
                    onClick={handleCollectionClick}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md disabled:opacity-50"
                  >
                    Collection
                  </button>
                )}
                {isArchivePage ? (
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
                )}
                <button
                  onClick={handleBulkDelete}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 rounded-md disabled:opacity-50"
                >
                  {isArchivePage ? "Delete permanently" : "Delete"}
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

      {/* Card View */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4" suppressHydrationWarning>
          {links.map((link) => {
            const isSelected = mounted && selectedLinks.has(link.id);
            const domain = extractDomain(link.url);

            return (
              <div
                key={link.id}
                className={cn(
                  "bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 hover:shadow-md transition-all",
                  isSelected && "ring-2 ring-primary-500 border-primary-500"
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectLink(link.id, e.target.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-1 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer flex-shrink-0"
                    aria-label={`Select ${link.title}`}
                    suppressHydrationWarning
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      {link.favicon && (
                        <Image
                          src={link.favicon}
                          alt=""
                          width={20}
                          height={20}
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                          unoptimized
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/dashboard/links/${link.id}`}
                          className="block font-semibold text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 mb-1 line-clamp-2"
                        >
                          {link.title}
                        </Link>
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
                      </div>
                      {link.isFavorite && (
                        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>
                    {link.description && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 line-clamp-2">
                        {link.description}
                      </p>
                    )}
                    {link.rating && (
                      <div className="flex items-center gap-1 mb-2">
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
                    {link.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {link.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} className="text-[10px] px-1.5 py-0.5">
                            {tag}
                          </Badge>
                        ))}
                        {link.tags.length > 3 && (
                          <Badge className="text-[10px] px-1.5 py-0.5">
                            +{link.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    {link.collections.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {link.collections.slice(0, 2).map((lc) => (
                          <Badge
                            key={lc.collection.id}
                            className="text-[10px] px-1.5 py-0.5"
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
                          <Badge className="text-[10px] px-1.5 py-0.5">
                            +{link.collections.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                    {link.notes && (
                      <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Has notes</span>
                      </div>
                    )}
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                      {formatDate(link.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-700" suppressHydrationWarning>
          {links.map((link) => {
            const isSelected = mounted && selectedLinks.has(link.id);
            const domain = extractDomain(link.url);

            return (
              <div
                key={link.id}
                className={cn(
                  "p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
                  isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
                )}
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
                    suppressHydrationWarning
                  />
                  {link.favicon && (
                    <Image
                      src={link.favicon}
                      alt=""
                      width={20}
                      height={20}
                      className="w-5 h-5 flex-shrink-0"
                      unoptimized
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/links/${link.id}`}
                        className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 truncate"
                      >
                        {link.title}
                      </Link>
                      {link.isFavorite && (
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
                      <Badge className={cn(getLinkTypeColor(link.linkType), "text-[10px] px-1.5 py-0.5")}>
                        {getLinkTypeLabel(link.linkType)}
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
                        {formatDate(link.createdAt)}
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
        <div className="overflow-x-auto" suppressHydrationWarning>
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
                    suppressHydrationWarning
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
                const isSelected = mounted && selectedLinks.has(link.id);
                const domain = extractDomain(link.url);

                return (
                  <tr key={link.id} className={cn("hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors", isSelected && "bg-primary-50 dark:bg-primary-900/20")}>
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
                        suppressHydrationWarning
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {link.favicon && (
                          <Image
                            src={link.favicon}
                            alt=""
                            width={20}
                            height={20}
                            className="w-5 h-5 flex-shrink-0"
                            unoptimized
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/links/${link.id}`}
                              className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 truncate"
                            >
                              {link.title}
                            </Link>
                            {link.isFavorite && (
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
                      <Badge className={getLinkTypeColor(link.linkType)}>
                        {getLinkTypeLabel(link.linkType)}
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
                        {formatDate(link.createdAt)}
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
              {isArchivePage ? "Delete permanently" : "Delete Links"}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Are you sure you want to {isArchivePage ? "permanently delete" : "delete"} {selectedLinks.size} link{selectedLinks.size !== 1 ? "s" : ""}? This action cannot be undone.
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
                {isProcessing ? "Deleting..." : isArchivePage ? "Delete permanently" : "Delete"}
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
          {/* Mode selector */}
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

          {/* Form for selected mode */}
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

          {/* Actions */}
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
