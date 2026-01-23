"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { deleteLink } from "@/server/actions/links";
import { useSidebar } from "./LinkDetailLayout";
import { cn } from "@/lib/utils/cn";
import { EditLinkDialog } from "@/components/features/links/EditLinkDialog";

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
}: LinkDetailHeaderProps) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const { isOpen: sidebarOpen } = useSidebar();

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

  return (
    <div className="space-y-4">
      {/* Action buttons row - Back on left, Edit/Delete on right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard/links">
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
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
        
        {/* Edit Button and Delete Button (mobile only) */}
        <div className="flex items-center gap-2 sm:hidden">
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => setEditDialogOpen(true)}>
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
        </div>
        
        {/* Edit Button and Delete Button (desktop only) */}
        <div
          className={cn(
            "hidden sm:flex flex-wrap items-center gap-2 flex-shrink-0 lg:transition-all lg:duration-300 lg:ease-in-out",
            sidebarOpen ? "lg:mr-[360px]" : "lg:mr-12"
          )}
        >
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => setEditDialogOpen(true)}>
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
        </div>
      </div>
      
      {/* Title section - centered, accounting for sidebar */}
      <div 
        className={cn(
          "w-full flex justify-center lg:transition-all lg:duration-300 lg:ease-in-out",
          sidebarOpen ? "lg:max-w-[calc(100%-372px)]" : "lg:max-w-[calc(100%-60px)]"
        )}
      >
        <div className="text-center w-full max-w-4xl">
          <div className="flex items-center justify-center gap-3 mb-2">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="w-8 h-8 flex-shrink-0 rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 break-words">
              {linkTitle}
            </h1>
            {isFavorite && (
              <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
          </div>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm sm:text-base mb-3 inline-block"
          >
            {linkUrl} ↗
          </a>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mb-3 sm:mb-0">
            Created {formatDateTimeInTimezone(createdAt, userTimezone)}
          </p>
          {/* Description on mobile - shown directly under title */}
          {description && (
            <div className="sm:hidden mt-4 text-left">
              <p className="text-neutral-600 dark:text-neutral-400">{description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      {canEdit && (
        <EditLinkDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          link={{
            id: linkId,
            url: linkUrl,
            title: linkTitle,
            description: description || null,
            linkType: linkType as any,
            tags: tags,
            notes: notes,
            isFavorite: isFavorite,
            rating: rating,
            collections: collections,
            metadataExtractedAt: metadataExtractedAt,
          }}
        />
      )}

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
    </div>
  );
};
