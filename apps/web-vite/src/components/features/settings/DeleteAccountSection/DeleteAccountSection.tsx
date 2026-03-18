import React from "react";
import { Button } from "@/components/ui/Button";
import { DeleteAccountDialog } from "../DeleteAccountDialog/DeleteAccountDialog";

export const DeleteAccountSection = () => {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border-2 border-error-200 dark:border-error-800 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-error-100 dark:bg-error-900 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400"
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
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Delete Account
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  Permanently delete your account and all associated data
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Once you delete your account, there is no going back. Please be certain.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-neutral-600 dark:text-neutral-400 ml-2">
                <li>All your data will be permanently removed</li>
                <li>You will be logged out immediately</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => setDialogOpen(true)}
            className="w-full sm:w-auto flex-shrink-0"
          >
            Delete Account
          </Button>
        </div>
      </div>

      <DeleteAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
};
