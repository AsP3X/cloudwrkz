import * as React from "react";
import type { LoginQueuedUiState } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";

/**
 * Same pattern as the login form: nothing shown until the API returns 202 for a deferred mutation,
 * then a {@link LoginQueuedBanner} appears (same component as sign-in) until polling finishes.
 */
export function MutationQueueNotice() {
  const [queuedUi, setQueuedUi] = React.useState<LoginQueuedUiState | null>(null);

  React.useEffect(() => {
    const onQueued = (e: Event) => {
      const d = (
        e as CustomEvent<{
          job_id: string;
          path: string;
          message?: string;
          retry_deadline_secs: number;
        }>
      ).detail;
      const retry = d.retry_deadline_secs ?? 30;
      const maxWaitSecs = retry + 5;
      setQueuedUi({
        headline: "Change processing",
        supportLines: [
          "Your save was accepted with HTTP 202: the API applies it in the background, including automatic retries if the database was briefly unavailable.",
          `If Postgres was down when you submitted, the server retries for up to about ${retry} seconds—stay on this page.`,
          "We poll job status about once per second—do not submit the same action again unless this times out or fails.",
          `If nothing completes within about ${maxWaitSecs} seconds, you will see an error.`,
        ],
        maxWaitSecs,
        startedAt: Date.now(),
      });
    };
    const onFinished = () => setQueuedUi(null);
    window.addEventListener("cloudwrkz:mutation-queued", onQueued);
    window.addEventListener("cloudwrkz:mutation-finished", onFinished);
    return () => {
      window.removeEventListener("cloudwrkz:mutation-queued", onQueued);
      window.removeEventListener("cloudwrkz:mutation-finished", onFinished);
    };
  }, []);

  if (!queuedUi) {
    return null;
  }

  return (
    <div className="mb-4" role="region" aria-label="Queued save status">
      <LoginQueuedBanner state={queuedUi} className="w-full min-h-[3rem]" />
    </div>
  );
}
