"use client";

import { useEffect, useState } from "react";

export function OfflineWarning() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for dark mode
    const checkDarkMode = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    
    checkDarkMode();
    
    // Watch for dark mode changes
    if (typeof document !== "undefined") {
      const observer = new MutationObserver(checkDarkMode);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div 
      className="w-full border-b-2 border-yellow-400 dark:border-yellow-600"
      data-testid="offline-warning-banner"
      style={{
        backgroundColor: isDark ? 'rgba(113, 63, 18, 0.9)' : 'rgb(253 230 138)', // yellow-900/90 for dark (more opaque), yellow-200 for light (more visible)
        width: '100%',
        display: 'block'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 text-yellow-800 dark:text-yellow-200 flex-shrink-0"
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
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                You are currently offline
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-0.5">
                Please check your internet connection. Some features may not be available until you reconnect.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
