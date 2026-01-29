"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { type LinkViewMode } from "../LinkViewContext";
import { bulkUpdateLinks, bulkDeleteLinks, bulkArchiveLinks, bulkUnarchiveLinks } from "@/server/actions/links";
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
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
    </div>
  );
};
