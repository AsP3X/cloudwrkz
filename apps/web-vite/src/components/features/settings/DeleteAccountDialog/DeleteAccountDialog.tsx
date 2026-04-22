import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { clearUserCache } from "@/lib/auth/userCache";

// Human: React UI for `DeleteAccountDialog` in account, privacy, and session settings: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE settings; SECURITY sessions delete-account; EXPORTS DeleteAccountDialog; REACT component; READS props hooks; MAY CALL api client.
interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DeleteAccountDialog = ({ open, onOpenChange }: DeleteAccountDialogProps) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmationText, setConfirmationText] = React.useState("");

  const requiredConfirmation = "DELETE";

  const handleDelete = async () => {
    if (confirmationText !== requiredConfirmation) {
      setError(`Please type "${requiredConfirmation}" to confirm deletion.`);
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await api.post("/auth/delete-account");
      localStorage.removeItem("auth_token");
      clearUserCache();
      navigate(ROUTES.LOGIN);
    } catch (error) {
      console.error("Account deletion error:", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmationText("");
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Delete Account"
      description="This action cannot be undone. All your data will be permanently deleted."
    >
      <div className="px-6 py-4 space-y-6">
        {/* Warning Message */}
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
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
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-error-800 dark:text-error-200 mb-1">
                Warning: This action is permanent
              </h3>
              <p className="text-sm text-error-700 dark:text-error-300">
                Once you delete your account, all of your data including tickets, comments, and profile information will be permanently removed. This action cannot be undone.
              </p>
            </div>
          </div>
        </div>

        {/* What will be deleted */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            The following will be permanently deleted:
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-neutral-600 dark:text-neutral-400 ml-2">
            <li>Your profile and account information</li>
            <li>All tickets you created</li>
            <li>All comments you made</li>
            <li>Your session data</li>
            <li>All other associated data</li>
          </ul>
        </div>

        {/* Confirmation Input */}
        <div className="space-y-2">
          <label
            htmlFor="confirmation"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            To confirm, type <span className="font-mono font-bold text-error-600 dark:text-error-400">{requiredConfirmation}</span> in the box below:
          </label>
          <input
            id="confirmation"
            type="text"
            value={confirmationText}
            onChange={(e) => {
              setConfirmationText(e.target.value);
              setError(null);
            }}
            placeholder={requiredConfirmation}
            disabled={isDeleting}
            className="w-full px-4 py-2 border-2 border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-error-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            autoComplete="off"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
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

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={isDeleting || confirmationText !== requiredConfirmation}
            loading={isDeleting}
          >
            {isDeleting ? "Deleting Account..." : "Delete My Account"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
