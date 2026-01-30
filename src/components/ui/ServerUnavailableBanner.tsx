"use client";

import { useEffect, useState } from "react";

interface ServerUnavailableBannerProps {
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function ServerUnavailableBanner({ onDismiss, dismissible = true }: ServerUnavailableBannerProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };
    checkDarkMode();
    if (typeof document !== "undefined") {
      const observer = new MutationObserver(checkDarkMode);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div
      className="w-full border-b-2 border-amber-500 dark:border-amber-600"
      data-testid="server-unavailable-banner"
      style={{
        backgroundColor: isDark ? "rgba(120, 53, 15, 0.95)" : "rgb(254 243 199)",
        width: "100%",
        display: "block",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <svg
              className="h-5 w-5 text-amber-800 dark:text-amber-200 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Server temporarily unavailable
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                The server is not responding. Please check your connection and try again. Your data has not been lost.
              </p>
            </div>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex-shrink-0 p-1.5 rounded-md text-amber-800 dark:text-amber-200 hover:bg-amber-200/50 dark:hover:bg-amber-800/30 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
