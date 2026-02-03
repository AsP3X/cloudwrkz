"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { deleteLink, removeSharedLinkForMe } from "@/server/actions/links";
import { useSidebar } from "./LinkDetailLayout";
import { cn } from "@/lib/utils/cn";
import { handleArchiveLink, handleUnarchiveLink } from "./actions";
import { ShareLinkDialog } from "@/components/features/links/ShareLinkDialog";
import { CopyToMyCollectionDialog } from "@/components/features/links/CopyToMyCollectionDialog";

interface LinkDetailHeaderProps {
  linkId: string;
  linkTitle: string;
  linkUrl: string;
  createdAt: Date;
  canEdit: boolean;
  canDelete?: boolean;
  description?: string | null;
  favicon?: string | null;
  isFavorite?: boolean;
  linkType?: string;
  tags?: string[];
  notes?: string | null;
  rating?: number | null;
  collections?: Array<{
    collection: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  metadataExtractedAt?: Date | null;
  userTimezone?: string;
  onEditClick?: () => void;
  isEditMode?: boolean;
  renderRatingInput?: () => React.ReactNode;
  archivedAt?: Date | null;
  onFavoriteToggle?: () => void;
  showShare?: boolean;
  showAddToMyCollection?: boolean;
  /** When true, show "Remove from Shared with me" (removes share for current user only). */
  showRemoveFromShared?: boolean;
}

export const LinkDetailHeader = ({ 
  linkId, 
  linkTitle,
  linkUrl,
  createdAt, 
  canEdit,
  canDelete = false,
  description,
  favicon,
  isFavorite = false,
  linkType = "WEBSITE",
  tags = [],
  notes = null,
  rating = null,
  collections = [],
  metadataExtractedAt = null,
  userTimezone = "UTC",
  onEditClick,
  isEditMode = false,
  renderRatingInput,
  archivedAt = null,
  onFavoriteToggle,
  showShare = false,
  showAddToMyCollection = false,
  showRemoveFromShared = false,
}: LinkDetailHeaderProps) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [removeFromSharedDialogOpen, setRemoveFromSharedDialogOpen] = React.useState(false);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [copyToCollectionOpen, setCopyToCollectionOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRefMobile = React.useRef<HTMLDivElement>(null);
  const menuRefDesktop = React.useRef<HTMLDivElement>(null);
  const { isOpen: sidebarOpen } = useSidebar();

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside = menuRefMobile.current?.contains(target) || menuRefDesktop.current?.contains(target);
      if (!inside) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleDelete = async () => {
    try {
      const result = await deleteLink(linkId);
      if (result.success) {
        setDeleteDialogOpen(false);
        router.push("/dashboard/links");
        router.refresh();
      } else {
        alert(result.error || "Failed to delete link. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("Failed to delete link. Please try again.");
    }
  };

  const handleRemoveFromShared = async () => {
    try {
      const result = await removeSharedLinkForMe(linkId);
      if (result.success) {
        setRemoveFromSharedDialogOpen(false);
        router.push("/dashboard/links");
        router.refresh();
      } else {
        alert(result.error || "Failed to remove from Shared with me.");
      }
    } catch (error) {
      console.error("Error removing from shared:", error);
      alert("Failed to remove from Shared with me.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Action buttons row - Back on left, Edit/Delete on right */}
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-3">
        <Link href="/dashboard/links" className="w-full min-w-0 sm:w-auto">
          <Button variant="outline" size="sm" className="w-full sm:w-auto min-h-[44px] sm:min-h-0 touch-manipulation">
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Links
          </Button>
        </Link>
        
        {/* Edit, Delete, three-dot menu (Archive + Share), Add to my collection (mobile only) */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:hidden min-w-0 w-full">
          {canEdit && !isEditMode && (
            <Button variant="primary" size="sm" className="min-h-[44px] sm:min-h-0 touch-manipulation" onClick={onEditClick}>
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button 
              variant="danger" 
              size="sm" 
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 touch-manipulation"
              onClick={() => setDeleteDialogOpen(true)}
              aria-label="Delete Link"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </Button>
          )}
          {showRemoveFromShared && (
            <Button 
              variant="danger" 
              size="sm" 
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 touch-manipulation"
              onClick={() => setRemoveFromSharedDialogOpen(true)}
              aria-label="Remove from Shared with me"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </Button>
          )}
          {!showAddToMyCollection && (
            <div className="relative" ref={menuRefMobile}>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 touch-manipulation"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-expanded={menuOpen}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                  {archivedAt ? (
                    <form action={handleUnarchiveLink}>
                      <input type="hidden" name="linkId" value={linkId} />
                      <button
                        type="submit"
                        className="w-full px-4 py-2 min-h-[44px] sm:min-h-0 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center touch-manipulation"
                      >
                        Unarchive
                      </button>
                    </form>
                  ) : (
                    <form action={handleArchiveLink}>
                      <input type="hidden" name="linkId" value={linkId} />
                      <button
                        type="submit"
                        className="w-full px-4 py-2 min-h-[44px] sm:min-h-0 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center touch-manipulation"
                      >
                        Archive
                      </button>
                    </form>
                  )}
                  {showShare && (
                    <button
                      type="button"
                      onClick={() => {
                        setShareDialogOpen(true);
                        setMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 min-h-[44px] sm:min-h-0 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center touch-manipulation"
                    >
                      Share
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {showAddToMyCollection && (
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 touch-manipulation" onClick={() => setCopyToCollectionOpen(true)}>
              Add to my collection
            </Button>
          )}
        </div>
        
        {/* Edit, Delete, three-dot menu (Archive + Share), Add to my collection (desktop only) */}
        <div
          className={cn(
            "hidden sm:flex flex-wrap items-center gap-2 flex-shrink-0 lg:transition-all lg:duration-300 lg:ease-in-out",
            sidebarOpen ? "lg:mr-[360px]" : "lg:mr-12"
          )}
        >
          {canEdit && !isEditMode && (
            <Button variant="primary" size="sm" onClick={onEditClick}>
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit Link
            </Button>
          )}
          {canDelete && (
            <Button 
              variant="danger" 
              size="sm" 
              onClick={() => setDeleteDialogOpen(true)}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Link
            </Button>
          )}
          {showRemoveFromShared && (
            <Button 
              variant="danger" 
              size="sm" 
              onClick={() => setRemoveFromSharedDialogOpen(true)}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Remove from Shared with me
            </Button>
          )}
          {!showAddToMyCollection && (
            <div className="relative" ref={menuRefDesktop}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-expanded={menuOpen}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                  {archivedAt ? (
                    <form action={handleUnarchiveLink}>
                      <input type="hidden" name="linkId" value={linkId} />
                      <button
                        type="submit"
                        className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        Unarchive
                      </button>
                    </form>
                  ) : (
                    <form action={handleArchiveLink}>
                      <input type="hidden" name="linkId" value={linkId} />
                      <button
                        type="submit"
                        className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        Archive
                      </button>
                    </form>
                  )}
                  {showShare && (
                    <button
                      type="button"
                      onClick={() => {
                        setShareDialogOpen(true);
                        setMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Share
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {showAddToMyCollection && (
            <Button variant="outline" size="sm" onClick={() => setCopyToCollectionOpen(true)}>
              Add to my collection
            </Button>
          )}
        </div>
      </div>
      
      {/* Title section - centered, accounting for sidebar */}
      <div 
        className={cn(
          "w-full flex justify-center px-2 sm:px-0 lg:transition-all lg:duration-300 lg:ease-in-out",
          sidebarOpen ? "lg:max-w-[calc(100%-372px)]" : "lg:max-w-[calc(100%-60px)]"
        )}
      >
        <div className="text-center w-full max-w-4xl min-w-0">
          {/* Mobile: favicon above title. sm+: favicon beside title */}
          <div className="flex flex-col items-center gap-2 mb-2 min-w-0 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            {favicon && (
              <Image
                src={favicon}
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 flex-shrink-0 rounded"
                unoptimized
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="flex items-center justify-center gap-3 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 break-words min-w-0">
                {linkTitle}
              </h1>
              {isEditMode && onFavoriteToggle ? (
                <button
                  type="button"
                  onClick={onFavoriteToggle}
                  className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center flex-shrink-0"
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className={isFavorite ? "w-6 h-6 text-yellow-500 fill-current" : "w-6 h-6 text-neutral-400 hover:text-yellow-500 transition-colors"}
                    fill={isFavorite ? "currentColor" : "none"}
                    viewBox="0 0 20 20"
                    stroke={isFavorite ? "none" : "currentColor"}
                    strokeWidth={isFavorite ? 0 : 1.5}
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              ) : isFavorite ? (
                <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ) : null}
            </div>
          </div>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full max-w-full text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm sm:text-base mb-3 break-all touch-manipulation"
          >
            {linkUrl} ↗
          </a>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mb-2">
            Created {formatDateTimeInTimezone(createdAt, userTimezone)}
          </p>
          {/* Rating */}
          {isEditMode && renderRatingInput && typeof renderRatingInput === 'function' ? (
            <div className="mb-3 sm:mb-0">
              {renderRatingInput()}
            </div>
          ) : rating ? (
            <div className="flex items-center justify-center gap-1 mb-3 sm:mb-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-4 h-4 ${
                    star <= rating!
                      ? "text-yellow-500 fill-current"
                      : "text-neutral-400 dark:text-neutral-500 fill-none"
                  }`}
                  fill={star <= rating! ? "currentColor" : "none"}
                  viewBox="0 0 20 20"
                  stroke={star <= rating! ? "none" : "currentColor"}
                  strokeWidth={1.5}
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {canDelete && deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Delete Link
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">
              Are you sure you want to delete this link? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from Shared with me Confirmation Dialog */}
      {showRemoveFromShared && removeFromSharedDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Remove from Shared with me
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">
              This will only remove the link from your list. The owner and others it was shared with will not be affected.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRemoveFromSharedDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRemoveFromShared}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {shareDialogOpen && (
        <ShareLinkDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          linkId={linkId}
          linkTitle={linkTitle}
        />
      )}
      {copyToCollectionOpen && (
        <CopyToMyCollectionDialog
          open={copyToCollectionOpen}
          onOpenChange={setCopyToCollectionOpen}
          linkId={linkId}
          linkTitle={linkTitle}
        />
      )}
    </div>
  );
};
