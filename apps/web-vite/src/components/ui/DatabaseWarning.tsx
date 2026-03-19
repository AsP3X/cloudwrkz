import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

interface DatabaseWarningProps {
  isServerUnreachable?: boolean;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
}

export function DatabaseWarning({
  isServerUnreachable = false,
  error,
  onRetry,
  isRetrying = false,
}: DatabaseWarningProps) {
  const title = isServerUnreachable
    ? "Cannot connect to the backend"
    : "Database service is currently unavailable";

  const description = isServerUnreachable
    ? (error || "The API service is down or still starting.")
    : error && error.toLowerCase().includes("server")
      ? error
      : error || "Some features may not work correctly.";

  return (
    <div className="w-full bg-transparent px-3 py-2 sm:px-4">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-lg border border-amber-300/80 bg-amber-50/95 px-4 py-3 shadow-md backdrop-blur dark:border-amber-700/70 dark:bg-amber-900/35">
          <div className="flex items-center gap-3">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
              {description}
              {!isServerUnreachable && !error && (
                <>
                  {" "}Please check the{" "}
                  <Link to={ROUTES.HEALTH} className="font-medium underline transition-colors hover:text-amber-950 dark:hover:text-amber-50">
                    health status page
                  </Link>{" "}
                  for more information.
                </>
              )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onRetry && (
                <button
                  type="button"
                  aria-busy={isRetrying}
                  onClick={() => {
                    if (!isRetrying) void onRetry();
                  }}
                  className={`inline-flex h-8 min-w-[92px] items-center justify-center gap-1.5 rounded-md border border-amber-400/90 bg-amber-100 px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-500/70 dark:bg-amber-800/60 dark:text-amber-100 dark:hover:bg-amber-700/70 ${
                    isRetrying ? "pointer-events-none cursor-wait opacity-80" : ""
                  }`}
                  aria-live="polite"
                >
                  {isRetrying ? (
                    <>
                      <span
                        className="cloudwrkz-retry-spin h-3.5 w-3.5 text-amber-800 dark:text-amber-100"
                        aria-hidden="true"
                      >
                        <svg className="h-full w-full" viewBox="0 0 24 24" fill="none">
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            className="opacity-25"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            d="M21 12a9 9 0 0 0-9-9"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            className="opacity-90"
                          />
                        </svg>
                      </span>
                      <span>Retrying</span>
                      <span className="inline-flex items-end gap-0.5 pb-0.5 text-amber-800 dark:text-amber-100" aria-hidden="true">
                        <span className="cloudwrkz-retry-dot" />
                        <span className="cloudwrkz-retry-dot cloudwrkz-retry-dot--delay-1" />
                        <span className="cloudwrkz-retry-dot cloudwrkz-retry-dot--delay-2" />
                      </span>
                    </>
                  ) : (
                    "Retry now"
                  )}
                </button>
              )}
              <Link
                to={ROUTES.HEALTH}
                className="inline-flex h-8 items-center rounded-md border border-transparent px-2 text-xs font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-amber-950 dark:text-amber-100 dark:hover:text-amber-50"
              >
                Health status
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
