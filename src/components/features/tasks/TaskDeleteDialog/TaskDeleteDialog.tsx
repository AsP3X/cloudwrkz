"use client";

import React from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface Subtask {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

interface TaskDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  taskTitle: string;
  subtasks?: Subtask[];
}

export const TaskDeleteDialog = ({
  open,
  onOpenChange,
  onConfirm,
  taskTitle,
  subtasks = [],
}: TaskDeleteDialogProps) => {
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Reset loading state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setIsDeleting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      // Don't close here - parent component handles closing after success
    } catch (error) {
      setIsDeleting(false);
      // Keep dialog open on error so user can see what went wrong
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Task?"
      description="This action cannot be undone. The task will be permanently deleted."
    >
      <div className="p-6 space-y-6">
        {/* Warning Icon */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-error-600 dark:text-error-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Warning Message */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete the task{" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                &quot;{taskTitle}&quot;
              </span>
              ?
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              This will permanently remove the task{subtasks.length > 0 ? " and all its subtasks" : ""}. This action cannot be undone.
            </p>
          </div>

          {/* Subtasks List */}
          {subtasks.length > 0 && (
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 overflow-hidden">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-3 break-words">
                This task has {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""} that will also be deleted:
              </p>
              <ul className={`space-y-2 overflow-x-hidden ${subtasks.length > 5 ? "max-h-44 overflow-y-auto scrollbar-thin" : ""}`}>
                {subtasks.map((subtask) => (
                  <li key={subtask.id} className="min-w-0">
                    <Link
                      href={`/dashboard/todos/${subtask.id}`}
                      onClick={(e) => {
                        // Prevent the dialog from closing when clicking a subtask link
                        e.stopPropagation();
                      }}
                      className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/50 rounded-lg p-2 transition-colors min-w-0"
                    >
                      <svg
                        className="w-4 h-4 mt-0.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <span className="flex-1 min-w-0 break-words">{subtask.title}</span>
                      <svg
                        className="w-4 h-4 mt-0.5 text-neutral-400 dark:text-neutral-500 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={isDeleting}
            loading={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Task"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
