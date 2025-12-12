"use client";

import Link from "next/link";

export function DatabaseWarning() {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0"
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
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Database service is currently unavailable
              </p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                Some features may not work correctly. Please check the{" "}
                <Link
                  href="/health"
                  className="underline hover:text-red-900 dark:hover:text-red-100"
                >
                  health status page
                </Link>{" "}
                for more information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
