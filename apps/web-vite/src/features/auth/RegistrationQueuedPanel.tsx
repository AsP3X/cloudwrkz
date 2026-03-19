import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { log } from "@/lib/logger";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";
import {
  clearStoredRegisterJobId,
  getStoredRegisterJobId,
  setStoredRegisterJobId,
} from "@/lib/auth/pendingRegistration";

export type RegisterJobStatusPayload = {
  status: "pending" | "completed" | "failed";
  message?: string;
  user_id?: string;
  email?: string;
};

type TerminalOutcome = "completed" | "failed" | "expired";

type Props = {
  triggerJobId?: string | null;
  mode?: "register" | "resume";
  onTerminalStatus?: (outcome: TerminalOutcome) => void;
  className?: string;
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

export function RegistrationQueuedPanel({
  triggerJobId,
  mode = "register",
  onTerminalStatus,
  className,
}: Props) {
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const registerDetailsId = useId();
  const [jobId, setJobId] = useState<string | null>(() => getStoredRegisterJobId());
  const [payload, setPayload] = useState<RegisterJobStatusPayload | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);

  const activeJobId = jobId ?? triggerJobId ?? null;

  useEffect(() => {
    if (triggerJobId) {
      setStoredRegisterJobId(triggerJobId);
      setJobId(triggerJobId);
      setPollError(null);
      setPendingStartedAt(Date.now());
    }
  }, [triggerJobId]);

  useEffect(() => {
    const pollId = jobId ?? triggerJobId;
    if (!pollId) {
      setPayload(null);
      setPendingStartedAt(null);
      return;
    }

    setPayload(null);
    setPendingStartedAt((t) => t ?? Date.now());
    let cancelled = false;
    let timeoutId = 0;

    const schedule = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const data = await api.get<RegisterJobStatusPayload>(`/auth/register/status/${pollId}`);
        if (cancelled) return;
        setPayload(data);
        setPollError(null);
        if (data.status === "completed") {
          clearStoredRegisterJobId();
          setPendingStartedAt(null);
          onTerminalStatus?.("completed");
          return;
        }
        if (data.status === "failed") {
          clearStoredRegisterJobId();
          setPendingStartedAt(null);
          onTerminalStatus?.("failed");
          return;
        }
        schedule(1200);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          clearStoredRegisterJobId();
          setJobId(null);
          setPayload(null);
          setPendingStartedAt(null);
          onTerminalStatus?.("expired");
          return;
        }
        const msg = e instanceof Error ? e.message : "Could not check registration status";
        setPollError(msg);
        log.warn("register job status poll failed", { jobId: pollId, err: e });
        schedule(2000);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [jobId, triggerJobId, onTerminalStatus]);

  const [, bump] = useState(0);
  useEffect(() => {
    const pending = (payload?.status ?? "pending") === "pending";
    if (!activeJobId || !pending) return;
    const id = window.setInterval(() => bump((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [activeJobId, payload?.status]);

  if (!activeJobId) {
    return null;
  }

  const status = payload?.status ?? "pending";
  const elapsedSec =
    pendingStartedAt != null && status === "pending"
      ? Math.max(0, Math.floor((Date.now() - pendingStartedAt) / 1000))
      : 0;

  if (status === "completed") {
    return (
      <div
        className={cn(
          "rounded-lg border border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-950 px-3 py-2.5 shadow-sm",
          "mb-4",
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-200/80 dark:bg-success-900/50">
            <svg
              className="h-4 w-4 text-success-700 dark:text-success-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-success-900 dark:text-success-100 uppercase tracking-wide">
              Account ready
            </p>
            <p className="mt-0.5 text-xs font-medium text-success-800 dark:text-success-200 leading-snug">
              {payload?.message ?? "Your account was created."}{" "}
              <Link
                to={ROUTES.LOGIN}
                className="underline text-success-700 dark:text-success-300 hover:text-success-900 dark:hover:text-success-100"
              >
                Sign in now
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        className={cn(
          "rounded-lg border border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-950 px-3 py-2.5 shadow-sm",
          "mb-4",
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-error-200/80 dark:bg-error-900/50">
            <svg
              className="h-4 w-4 text-error-700 dark:text-error-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-error-900 dark:text-error-100 uppercase tracking-wide">
              Registration failed
            </p>
            <p className="mt-0.5 text-xs text-error-800 dark:text-error-200 leading-snug">
              {payload?.message ?? "Please try registering again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title =
    mode === "resume"
      ? "Finishing your sign-up (queued earlier)"
      : "Registration in progress";
  const intro =
    mode === "resume"
      ? "You started registration from another tab or page. This job is still running; use the info button for details."
      : "Every registration is processed asynchronously. The server creates your account in the background; use the info button for details.";

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 shadow-sm px-2.5 py-2",
        "mb-4",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-200/80 dark:bg-amber-900/60"
          aria-hidden
        >
          <svg
            className="h-3.5 w-3.5 text-amber-800 dark:text-amber-200 animate-spin"
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
        <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap text-xs leading-tight">
          <span className="shrink-0 rounded bg-amber-200/90 dark:bg-amber-900/80 px-1.5 py-0.5 font-bold uppercase tracking-wide text-[10px] text-amber-950 dark:text-amber-100">
            Queued
          </span>
          <span className="font-medium text-amber-950 dark:text-amber-50 truncate max-w-[min(100%,12rem)] sm:max-w-[18rem]">
            {title}
          </span>
          <span className="text-amber-800/90 dark:text-amber-200/80 tabular-nums shrink-0">
            {elapsedSec}s &middot; ~30s typical
          </span>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-amber-800 dark:text-amber-200 hover:bg-amber-200/60 dark:hover:bg-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 dark:focus:ring-offset-amber-950"
          aria-expanded={showQueueDetails}
          aria-controls={registerDetailsId}
          aria-label={showQueueDetails ? "Hide registration queue details" : "More about queued registration"}
          onClick={() => setShowQueueDetails((v) => !v)}
        >
          <InfoIcon className="h-5 w-5" />
        </button>
      </div>
      {showQueueDetails && (
        <div
          id={registerDetailsId}
          className="mt-2 border-t border-amber-200/70 dark:border-amber-800/80 pt-2 pl-1 space-y-2"
        >
          <p className="text-[11px] sm:text-xs text-amber-900/90 dark:text-amber-100/85 leading-snug">{intro}</p>
          <ul className="list-disc space-y-1 pl-4 text-[11px] sm:text-xs text-amber-900/90 dark:text-amber-100/85 leading-snug">
            <li>Your email and password hash are held only long enough to finish this job.</li>
            <li>You can also open Sign in; the queue banner appears there if a job is in progress.</li>
            <li>Do not submit the registration form again unless you see a failure message.</li>
          </ul>
          {pollError && (
            <p className="text-[11px] font-medium text-amber-950 dark:text-amber-100">
              Status check issue: {pollError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
