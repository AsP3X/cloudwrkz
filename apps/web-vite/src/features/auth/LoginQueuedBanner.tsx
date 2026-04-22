// Human: Inline status chip shown while the auth layer polls a deferred login job, including elapsed time and expandable details.
// Agent: PROPS LoginQueuedUiState; useEffect interval rerender; READS startedAt maxWaitSecs; ACCESSIBLE detailsId disclosure.

import { useEffect, useId, useState } from "react";
import type { LoginQueuedUiState } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils/cn";

type Props = {
  state: LoginQueuedUiState;
  className?: string;
  /** Width follows content (no flex-grow); use where the banner replaces a button. */
  shrinkToContent?: boolean;
};

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/** Visible while AuthProvider polls login job status after HTTP 202. */
export function LoginQueuedBanner({ state, className, shrinkToContent = false }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [state.startedAt]);

  const elapsedSec = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  const timeLabel =
    state.maxWaitSecs <= 0
      ? `${elapsedSec}s`
      : `${elapsedSec}s · ~${state.maxWaitSecs}s max`;

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 shadow-sm",
        shrinkToContent
          ? cn(
              "mb-0 w-fit max-w-full px-2.5 flex flex-col",
              showDetails ? "py-1" : "h-10 min-h-[2.5rem] box-border justify-center",
            )
          : "px-2.5 py-2 mb-3",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("flex items-center gap-2", shrinkToContent && "w-fit min-h-0")}>
        <div
          className={cn(
            "shrink-0 flex items-center justify-center rounded-md bg-amber-200/80 dark:bg-amber-900/60",
            shrinkToContent ? "h-6 w-6" : "h-7 w-7",
          )}
          aria-hidden
        >
          <svg
            className={cn(
              "text-amber-800 dark:text-amber-200 animate-spin",
              shrinkToContent ? "h-3 w-3" : "h-3.5 w-3.5",
            )}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <div
          className={cn(
            "min-w-0 flex items-center gap-1.5 text-xs leading-none",
            shrinkToContent ? "flex-none flex-nowrap" : "flex-1 flex-wrap leading-tight",
          )}
        >
          <span className="shrink-0 rounded bg-amber-200/90 dark:bg-amber-900/80 px-1.5 py-0.5 font-bold uppercase tracking-wide text-[10px] text-amber-950 dark:text-amber-100">
            Queued
          </span>
          <span
            className={cn(
              "font-medium text-amber-950 dark:text-amber-50",
              shrinkToContent ? "truncate min-w-0" : "truncate max-w-[min(100%,14rem)] sm:max-w-none",
            )}
          >
            {state.headline}
          </span>
          <span className="text-amber-800/90 dark:text-amber-200/80 tabular-nums shrink-0">{timeLabel}</span>
        </div>
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-md text-amber-800 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 dark:focus:ring-offset-amber-950",
            shrinkToContent ? "p-0.5" : "p-1",
          )}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          aria-label={showDetails ? "Hide queued sign-in details" : "More about queued sign-in"}
          onClick={() => setShowDetails((v) => !v)}
        >
          <InfoIcon className={shrinkToContent ? "h-4 w-4" : "h-5 w-5"} />
        </button>
      </div>
      {showDetails && (
        <div
          id={detailsId}
          className="mt-2 border-t border-amber-200/70 dark:border-amber-800/80 pt-2 pl-1"
        >
          <ul className="list-disc space-y-1 pl-4 text-[11px] sm:text-xs text-amber-900/90 dark:text-amber-100/85 leading-snug">
            {state.supportLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
