"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { getAllUsersAdmin } from "@/server/actions/admin/users";

type User = Awaited<ReturnType<typeof getAllUsersAdmin>>["users"][0];

interface UserUnbanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onConfirm: (reason: string) => Promise<any>;
  isLoading: boolean;
}

export function UserUnbanDialog({ open, onOpenChange, user, onConfirm, isLoading }: UserUnbanDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError("Unban reason is required");
      return;
    }
    setError(null);
    const result = await onConfirm(reason);
    if (result?.success) {
      setReason("");
      onOpenChange(false);
    } else if (result?.error) {
      setError(result.error);
    }
  };

  const handleClose = () => {
    setReason("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Unban User"
      description={`Unban ${user.email}? This will restore their access to the platform.`}
    >
      <div className="p-6">
        <div className="p-4 bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 rounded-lg mb-4">
          <p className="text-sm text-success-700 dark:text-success-300">
            This will restore the user's access to the platform. Any pending unban requests will be automatically approved and associated tickets will be marked as resolved.
          </p>
        </div>

        <div className="space-y-4">
          <div className="w-full">
            <label
              htmlFor="unban-reason"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Unban Reason <span className="text-error-500 dark:text-error-400 ml-1">*</span>
            </label>
            <textarea
              id="unban-reason"
              placeholder="Enter the reason for unbanning this user..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              rows={4}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                error
                  ? "border-error-300 bg-error-50 focus:border-error-500 focus:ring-error-500 dark:border-error-700 dark:bg-error-950 dark:focus:border-error-400 dark:focus:ring-error-400"
                  : "bg-white text-neutral-900 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400"
              } placeholder:text-neutral-400 dark:placeholder:text-neutral-500`}
              required
            />
            {error && (
              <p className="mt-2 text-sm text-error-600 dark:text-error-400 flex items-center gap-1">
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
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} loading={isLoading}>
            Unban User
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
