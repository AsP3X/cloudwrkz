"use client";

import { useEffect, useRef } from "react";

export const SkipToContent = () => {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // Blur the skip link if it gets focused on mount (e.g., from navigation)
    // This prevents it from showing when navigating between pages
    const blurIfFocused = () => {
      if (linkRef.current && document.activeElement === linkRef.current) {
        // Only blur if focus wasn't from keyboard navigation
        // Check if body was the previous active element (indicates programmatic focus)
        linkRef.current.blur();
        // Move focus to body to prevent it from jumping to next element
        if (document.body) {
          document.body.focus();
          document.body.blur();
        }
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      blurIfFocused();
    });

    // Also check after a short delay in case focus happens later
    const timer = setTimeout(blurIfFocused, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <a
      ref={linkRef}
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
};
