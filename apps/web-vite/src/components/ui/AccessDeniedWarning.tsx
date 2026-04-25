// Human: Centered card for permission failures with optional primary/secondary navigation and query-string building for the primary link.
// Agent: READS primaryHrefSearchParams; BUILDS URL via URL API with dummy host; RENDERS Button inside Links.
import React from "react";
import { Link } from "react-router-dom";
import { Button } from "./Button";

interface AccessDeniedWarningProps {
  title?: string;
  message: React.ReactNode;
  primaryLabel: string;
  primaryHref?: string;
  primaryHrefSearchParams?: Record<string, string | undefined>;
  customPrimary?: React.ReactNode;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function AccessDeniedWarning({
  title = "Access Denied",
  message,
  primaryLabel,
  primaryHref,
  primaryHrefSearchParams,
  customPrimary,
  secondaryHref,
  secondaryLabel,
}: AccessDeniedWarningProps) {
  // Human: We only append search params that are defined and non-empty so callers can omit optional tracking keys cleanly.
  // Agent: READS params entries; RETURNS pathname+search string; USES URL for parsing.
  const buildHref = (href: string, params?: Record<string, string | undefined>) => {
    if (!params || Object.keys(params).length === 0) return href;
    const url = new URL(href, "http://localhost");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    return url.pathname + (url.search ? url.search : "");
  };

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-amber-200 dark:border-amber-700 p-8 max-w-md w-full mx-4 text-center">
        <div className="mb-4">
          <svg
            className="h-12 w-12 mx-auto text-amber-600 dark:text-amber-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 2.25c-2.52 1.615-4.79 2.197-6.75 2.32a.75.75 0 0 0-.71.75v6.42c0 2.516 1.257 4.868 3.247 6.265 1.35.96 2.81 1.53 4.213 1.715a.75.75 0 0 0 .2 0c1.403-.185 2.863-.755 4.213-1.715 1.99-1.397 3.247-3.749 3.247-6.265V5.32a.75.75 0 0 0-.71-.75c-1.96-.123-4.23-.705-6.75-2.32a.75.75 0 0 0-.8 0Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 3.25h.008v.008H12z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          {title}
        </h2>
        <div className="text-neutral-600 dark:text-neutral-400 mb-6 text-sm">
          {message}
        </div>
        <div className="flex justify-center gap-3">
          {secondaryHref && secondaryLabel && (
            <Link to={secondaryHref}>
              <Button variant="outline">{secondaryLabel}</Button>
            </Link>
          )}
          {customPrimary ? (
            customPrimary
          ) : primaryHref ? (
            <Link to={buildHref(primaryHref, primaryHrefSearchParams)}>
              <Button variant="primary">{primaryLabel}</Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
