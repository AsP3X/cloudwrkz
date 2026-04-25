import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { LoginQueuedUiState } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";

// Human: React UI for `TodoBulkDeleteDialog` in tasks and todo lists: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tasks; BULK filters forms; EXPORTS TodoBulkDeleteDialog; REACT component; READS props hooks; MAY CALL api client.
interface TodoBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  selectedCount: number;
  /** API paths for each selected todo (`/todos/:id`) — used to match mutation / offline queue events. */
  apiMutationPaths: string[];
}

export const TodoBulkDeleteDialog = ({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
  apiMutationPaths,
}: TodoBulkDeleteDialogProps) => {
  const [deleteQueuedUi, setDeleteQueuedUi] = React.useState<LoginQueuedUiState | null>(null);
  const [offlineDeleteQueuedUi, setOfflineDeleteQueuedUi] = React.useState<LoginQueuedUiState | null>(null);
  const [pipelineStartedAt, setPipelineStartedAt] = React.useState<number | null>(null);

  const pathSet = React.useMemo(() => new Set(apiMutationPaths), [apiMutationPaths]);

  const pipelinePhaseUi: LoginQueuedUiState | null =
    pipelineStartedAt !== null && !offlineDeleteQueuedUi && !deleteQueuedUi
      ? {
          headline: "Delete ToDos queued",
          supportLines: [
            "Local → API → database: your delete requests are in the pipeline.",
            "Stay on this dialog until it completes—do not press Delete again.",
          ],
          maxWaitSecs: 0,
          startedAt: pipelineStartedAt,
        }
      : null;

  const deleteBannerState = offlineDeleteQueuedUi ?? deleteQueuedUi ?? pipelinePhaseUi;

  React.useEffect(() => {
    if (!open) {
      setDeleteQueuedUi(null);
      setOfflineDeleteQueuedUi(null);
      setPipelineStartedAt(null);
    }
  }, [open]);

  React.useEffect(() => {
    const onQueued = (e: Event) => {
      const d = (
        e as CustomEvent<{
          path: string;
          retry_deadline_secs: number;
        }>
      ).detail;
      if (!pathSet.has(d.path)) return;
      const retry = d.retry_deadline_secs ?? 30;
      const maxWaitSecs = retry + 5;
      const n = selectedCount;
      setDeleteQueuedUi({
        headline: n === 1 ? "Deleting ToDo" : "Deleting ToDos",
        supportLines: [
          "Your delete request(s) were accepted with HTTP 202: the API applies them in the background, including automatic retries if the database was briefly unavailable.",
          `If Postgres was down when you submitted, the server retries for up to about ${retry} seconds—stay on this dialog.`,
          "We poll job status about once per second—do not press Delete again unless this times out or fails.",
          `If nothing completes within about ${maxWaitSecs} seconds, you will see an error.`,
        ],
        maxWaitSecs,
        startedAt: Date.now(),
      });
    };
    window.addEventListener("cloudwrkz:mutation-queued", onQueued);
    return () => {
      window.removeEventListener("cloudwrkz:mutation-queued", onQueued);
    };
  }, [pathSet, selectedCount]);

  React.useEffect(() => {
    const onOfflineEnqueued = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (!pathSet.has(d.path) || d.method !== "DELETE") return;
      setOfflineDeleteQueuedUi({
        headline: "Delete ToDos queued",
        supportLines: [
          "The server could not be reached. Your delete request(s) are saved on this device.",
          "They will send automatically when your connection is working again. Stay on this dialog or return later.",
          "Do not repeat this delete elsewhere until this completes or you see an error.",
        ],
        maxWaitSecs: 0,
        startedAt: Date.now(),
      });
    };
    const onOfflineFinished = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (!pathSet.has(d.path) || d.method !== "DELETE") return;
      setOfflineDeleteQueuedUi(null);
    };
    window.addEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
    window.addEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    return () => {
      window.removeEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
      window.removeEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    };
  }, [pathSet]);

  const handleOpenChange = (next: boolean) => {
    if (!next && deleteBannerState) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    setDeleteQueuedUi(null);
    setPipelineStartedAt(Date.now());
    try {
      await onConfirm();
    } catch {
      /* parent may surface errors */
    } finally {
      setPipelineStartedAt(null);
      setDeleteQueuedUi(null);
    }
  };

  const inPipeline = Boolean(deleteBannerState);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
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
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={inPipeline}>
            Cancel
          </Button>
          {deleteBannerState ? (
            <LoginQueuedBanner shrinkToContent state={deleteBannerState} />
          ) : (
            <Button variant="danger" onClick={handleConfirm}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
