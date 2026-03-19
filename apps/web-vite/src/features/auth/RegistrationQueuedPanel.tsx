import { useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import { log } from "@/lib/logger";
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

type Props = {
  /** Set when a submit just returned `202` so polling starts immediately */
  triggerJobId?: string | null;
};

/**
 * Shown on login and register when the API has queued registration (database briefly down).
 * Polls until the job completes, fails, or disappears from server memory.
 */
export function RegistrationQueuedPanel({ triggerJobId }: Props) {
  const [jobId, setJobId] = useState<string | null>(() => getStoredRegisterJobId());
  const [payload, setPayload] = useState<RegisterJobStatusPayload | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (triggerJobId) {
      setStoredRegisterJobId(triggerJobId);
      setJobId(triggerJobId);
      setPollError(null);
    }
  }, [triggerJobId]);

  useEffect(() => {
    if (!jobId) {
      setPayload(null);
      return;
    }

    setPayload(null);
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
        const data = await api.get<RegisterJobStatusPayload>(`/auth/register/status/${jobId}`);
        if (cancelled) return;
        setPayload(data);
        setPollError(null);
        if (data.status === "completed" || data.status === "failed") {
          clearStoredRegisterJobId();
          return;
        }
        schedule(1200);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          clearStoredRegisterJobId();
          setJobId(null);
          setPayload(null);
          return;
        }
        const msg = e instanceof Error ? e.message : "Could not check registration status";
        setPollError(msg);
        log.warn("register job status poll failed", { jobId, err: e });
        schedule(2000);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [jobId]);

  if (!jobId) {
    return null;
  }

  const status = payload?.status ?? "pending";

  if (status === "completed") {
    return (
      <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-success-900 dark:text-success-100">
              Registration finished
            </p>
            <p className="mt-1 text-sm text-success-800 dark:text-success-200">
              {payload?.message ?? "Your account was created. You can sign in now."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
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
          <div>
            <p className="text-sm font-semibold text-error-900 dark:text-error-100">
              Registration could not be completed
            </p>
            <p className="mt-1 text-sm text-error-800 dark:text-error-200">
              {payload?.message ?? "Please try registering again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-800 p-4 mb-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0 animate-pulse"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Registration queued by the API
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            The database was temporarily unavailable. Your signup is saved and will be completed automatically within
            about 30 seconds. You can stay on this page or sign in shortly.
          </p>
          {pollError && (
            <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">{pollError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
