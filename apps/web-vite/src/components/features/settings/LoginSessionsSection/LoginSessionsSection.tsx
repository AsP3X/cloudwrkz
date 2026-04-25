import React from "react";
import { Button } from "@/components/ui/Button";
import { LoginSessionsDialog } from "../LoginSessionsDialog/LoginSessionsDialog";

// Human: React UI for `LoginSessionsSection` in account, privacy, and session settings: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE settings; SECURITY sessions delete-account; EXPORTS LoginSessionsSection; REACT component; READS props hooks; MAY CALL api client.
export const LoginSessionsSection = () => {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Login sessions
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  See where you&apos;re logged in and sign out from other devices.
                </p>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="w-full sm:w-auto flex-shrink-0"
          >
            Manage sessions
          </Button>
        </div>
      </div>

      <LoginSessionsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};
