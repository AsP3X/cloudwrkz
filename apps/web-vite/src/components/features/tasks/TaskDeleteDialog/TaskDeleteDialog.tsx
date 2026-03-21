import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { LoginQueuedUiState } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";

export interface TaskDeleteDialogSubtask {
  id: string;
  title: string;
  status?: string;
  priority?: string;
}

export interface TaskDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  /** API path for this delete (e.g. `/todos/:id`) — used to match mutation / offline queue events. */
  apiMutationPath: string;
  taskTitle: string;
  subtasks?: TaskDeleteDialogSubtask[];
}

const EMPTY_SUBTASKS: TaskDeleteDialogSubtask[] = [];

export function TaskDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  apiMutationPath,
  taskTitle,
  subtasks = EMPTY_SUBTASKS,
}: TaskDeleteDialogProps) {
  const [deleteQueuedUi, setDeleteQueuedUi] = useState<LoginQueuedUiState | null>(null);
  const [offlineDeleteQueuedUi, setOfflineDeleteQueuedUi] = useState<LoginQueuedUiState | null>(null);
  const [pipelineStartedAt, setPipelineStartedAt] = useState<number | null>(null);

  const pipelinePhaseUi: LoginQueuedUiState | null =
    pipelineStartedAt !== null && !offlineDeleteQueuedUi && !deleteQueuedUi
      ? {
          headline: "Delete ToDo queued",
          supportLines: [
            "Local → API → database: your delete request is in the pipeline.",
            "Stay on this dialog until it completes—do not press Delete again.",
          ],
          maxWaitSecs: 0,
          startedAt: pipelineStartedAt,
        }
      : null;

  const deleteBannerState = offlineDeleteQueuedUi ?? deleteQueuedUi ?? pipelinePhaseUi;

  useEffect(() => {
    if (!open) {
      setDeleteQueuedUi(null);
      setOfflineDeleteQueuedUi(null);
      setPipelineStartedAt(null);
    }
  }, [open]);

  useEffect(() => {
    const onQueued = (e: Event) => {
      const d = (
        e as CustomEvent<{
          path: string;
          retry_deadline_secs: number;
        }>
      ).detail;
      if (d.path !== apiMutationPath) return;
      const retry = d.retry_deadline_secs ?? 30;
      const maxWaitSecs = retry + 5;
      setDeleteQueuedUi({
        headline: "Deleting ToDo",
        supportLines: [
          "Your delete request was accepted with HTTP 202: the API applies it in the background, including automatic retries if the database was briefly unavailable.",
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
  }, [apiMutationPath]);

  useEffect(() => {
    const onOfflineEnqueued = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (d.path !== apiMutationPath || d.method !== "DELETE") return;
      setOfflineDeleteQueuedUi({
        headline: "Delete ToDo queued",
        supportLines: [
          "The server could not be reached. Your delete request is saved on this device.",
          "It will send automatically when your connection is working again. Stay on this dialog or return later.",
          "Do not delete this task again elsewhere until this completes or you see an error.",
        ],
        maxWaitSecs: 0,
        startedAt: Date.now(),
      });
    };
    const onOfflineFinished = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (d.path !== apiMutationPath || d.method !== "DELETE") return;
      setOfflineDeleteQueuedUi(null);
    };
    window.addEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
    window.addEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    return () => {
      window.removeEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
      window.removeEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    };
  }, [apiMutationPath]);

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
      /* caller may throw; keep dialog open */
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
      title="Delete Task?"
      description="This action cannot be undone. The task will be permanently deleted."
    >
      <div className="p-6 space-y-6">
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
              This will permanently remove the task
              {subtasks.length > 0 ? " and all its subtasks" : ""}. This action cannot be undone.
            </p>
          </div>

          {subtasks.length > 0 && (
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 overflow-hidden">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-3 break-words">
                This task has {subtasks.length} subtask{subtasks.length !== 1 ? "s" : ""} that will also be deleted:
              </p>
              <ul
                className={`space-y-2 overflow-x-hidden ${subtasks.length > 5 ? "max-h-44 overflow-y-auto scrollbar-thin" : ""}`}
              >
                {subtasks.map((subtask) => (
                  <li key={subtask.id} className="min-w-0">
                    <Link
                      to={`/dashboard/todos/${subtask.id}`}
                      onClick={(e) => e.stopPropagation()}
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

        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={inPipeline}>
            Cancel
          </Button>
          {deleteBannerState ? (
            <LoginQueuedBanner shrinkToContent state={deleteBannerState} />
          ) : (
            <Button variant="danger" onClick={handleConfirm}>
              Delete Task
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
