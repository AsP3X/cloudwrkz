"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface TodoBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  selectedCount: number;
}

export const TodoBulkDeleteDialog = ({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
}: TodoBulkDeleteDialogProps) => {
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
      title={`Delete ${selectedCount} ToDo${selectedCount !== 1 ? "s" : ""}?`}
      description="This action cannot be undone. All selected todos (and any subtodos) will be permanently deleted."
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
        <div className="text-center space-y-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedCount}
            </span>{" "}
            todo{selectedCount !== 1 ? "s" : ""}?
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            This will permanently remove all selected todos and any nested subtodos. This action cannot be undone.
          </p>
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
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

