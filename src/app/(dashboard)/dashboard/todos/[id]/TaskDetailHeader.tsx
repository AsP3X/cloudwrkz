"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { deleteTodo } from "@/server/actions/todos";
import { TaskDeleteDialog } from "@/components/features/tasks/TaskDeleteDialog";
import { useSidebar } from "./TaskDetailLayout";
import { cn } from "@/lib/utils/cn";

interface Subtask {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

interface TaskDetailHeaderProps {
  taskId: string;
  taskTitle: string;
  createdAt: Date;
  canEdit: boolean;
  canDelete?: boolean;
  description?: string | null;
  descriptionHtml?: string | null;
  parentTaskId?: string;
  isEditing?: boolean;
  userTimezone?: string;
  subtasks?: Subtask[];
}

export const TaskDetailHeader = ({ 
  taskId, 
  taskTitle, 
  createdAt, 
  canEdit,
  canDelete = false,
  description,
  descriptionHtml,
  parentTaskId,
  isEditing,
  userTimezone = "UTC",
  subtasks = [],
}: TaskDetailHeaderProps) => {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const { isOpen: sidebarOpen } = useSidebar();

  const backHref = parentTaskId ? `/dashboard/todos/${parentTaskId}` : "/dashboard/todos";
  const backLabel = parentTaskId ? "Back to Parent ToDo" : "Back to ToDos";

  const editHref = isEditing ? `/dashboard/todos/${taskId}` : `/dashboard/todos/${taskId}?mode=edit`;
  const editLabel = isEditing ? "Cancel Editing" : "Edit ToDo";

  const handleDelete = async () => {
    try {
      const result = await deleteTodo(taskId);
      if (result.success) {
        setDeleteDialogOpen(false);
        router.push(backHref);
        router.refresh();
      } else {
        alert(result.error || "Failed to delete task. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting task:", error);
      alert("Failed to delete task. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Action buttons row - Back on left, Edit/Delete on right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        
        {/* Edit Button and Delete Button (mobile only) - in line with Back button */}
        <div className="flex items-center gap-2 sm:hidden">
          {canEdit && (
            <Link href={editHref}>
              <Button variant="primary" size="sm" className="w-auto">
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
          {canDelete && (
            <Button 
              variant="danger" 
              size="sm" 
              className="w-auto"
              onClick={() => setDeleteDialogOpen(true)}
              aria-label="Delete ToDo"
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
        
        {/* Edit Button and Delete Button (desktop only) - aligned to right */}
        <div
          className={cn(
            "hidden sm:flex flex-wrap items-center gap-2 flex-shrink-0 lg:transition-all lg:duration-300 lg:ease-in-out",
            sidebarOpen ? "lg:mr-[360px]" : "lg:mr-12"
          )}
        >
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
          {canDelete && (
            <Button 
              variant="danger" 
              size="sm" 
              className="w-full sm:w-auto"
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
              Delete ToDo
            </Button>
          )}
        </div>
      </div>
      
      {/* Title section - centered, accounting for sidebar */}
      <div 
        className={cn(
          "w-full flex justify-center lg:transition-all lg:duration-300 lg:ease-in-out",
          // Constrain width to available content area (excluding sidebar padding)
          sidebarOpen ? "lg:max-w-[calc(100%-372px)]" : "lg:max-w-[calc(100%-60px)]"
        )}
      >
        <div className="text-center w-full max-w-4xl">
          <div className="mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 break-words">{taskTitle}</h1>
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
      
      {/* Delete Confirmation Dialog */}
      {canDelete && (
        <TaskDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDelete}
          taskTitle={taskTitle}
          subtasks={subtasks}
        />
      )}
    </div>
  );
};
