"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";

interface TaskDetailHeaderProps {
  taskId: string;
  taskTitle: string;
  createdAt: Date;
  canEdit: boolean;
  description?: string | null;
  descriptionHtml?: string | null;
  parentTaskId?: string;
  isEditing?: boolean;
  userTimezone?: string;
}

export const TaskDetailHeader = ({ 
  taskId, 
  taskTitle, 
  createdAt, 
  canEdit, 
  description,
  descriptionHtml,
  parentTaskId,
  isEditing,
  userTimezone = "UTC",
}: TaskDetailHeaderProps) => {

  const backHref = parentTaskId ? `/dashboard/tasks/${parentTaskId}` : "/dashboard/tasks";
  const backLabel = parentTaskId ? "Back to Parent Task" : "Back to Tasks";

  const editHref = isEditing ? `/dashboard/tasks/${taskId}` : `/dashboard/tasks/${taskId}?mode=edit`;
  const editLabel = isEditing ? "Cancel Editing" : "Edit Task";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href={backHref}>
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
            {backLabel}
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">{taskTitle}</h1>
          </div>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mb-3 sm:mb-0">
            Created {formatDateTimeInTimezone(createdAt, userTimezone)}
          </p>
          {/* Description on mobile - shown directly under title */}
          {(descriptionHtml || description) && (
            <div className="sm:hidden mt-4">
              <RichTextDisplay
                content={descriptionHtml || description || ""}
              />
            </div>
          )}
        </div>
      </div>
      {/* Edit Button and View Toggle (mobile only) */}
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        {canEdit && (
          <Link href={editHref}>
            <Button variant="primary" size="sm" className="w-full sm:w-auto">
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
              {editLabel}
            </Button>
          </Link>
        )}
      </div>
      {/* Edit Button (desktop only) */}
      {canEdit && (
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <Link href={editHref}>
            <Button variant="primary" size="sm" className="w-full sm:w-auto">
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
              {editLabel}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};
