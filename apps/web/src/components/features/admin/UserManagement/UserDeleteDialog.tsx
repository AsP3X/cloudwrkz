"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { getAllUsersAdmin } from "@/server/actions/admin/users";

type User = Awaited<ReturnType<typeof getAllUsersAdmin>>["users"][0];

interface UserDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onConfirm: () => Promise<any>;
  isLoading: boolean;
}

export function UserDeleteDialog({ open, onOpenChange, user, onConfirm, isLoading }: UserDeleteDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete User"
      description={`Are you sure you want to delete ${user.email}? This action cannot be undone.`}
    >
      <div className="p-6">
        <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg mb-4">
          <p className="text-sm text-error-700 dark:text-error-300">
            This will permanently delete the user account and all associated data. This action cannot be undone.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={isLoading}>
            Delete User
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
