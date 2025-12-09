"use client";

import React, { useState, useEffect } from "react";
import { SearchDialog } from "@/components/features/search/SearchDialog";
import { cn } from "@/lib/utils/cn";

export const GlobalSearch = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Handle Ctrl+F (STRG+F) shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+F (Windows/Linux) or Cmd+F (Mac)
      // Don't trigger if user is typing in an input/textarea
      if (
        (e.ctrlKey || e.metaKey) && 
        e.key === 'f' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsDialogOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <SearchDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      
      <button
        onClick={() => setIsDialogOpen(true)}
        className={cn(
          "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border-2 transition-all duration-200",
          "bg-white text-neutral-600 border-neutral-200",
          "dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800",
          "hover:border-neutral-300 dark:hover:border-neutral-700",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
          "focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400",
          "w-full sm:w-64 lg:w-80 justify-start min-w-0"
        )}
        aria-label="Search"
      >
        <svg
          className="w-5 h-5 text-neutral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-sm text-neutral-500 dark:text-neutral-400 truncate">Search...</span>
        <div className="ml-auto hidden sm:flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-600 flex-shrink-0">
          <kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
            Ctrl
          </kbd>
          <span className="text-neutral-400">+</span>
          <kbd className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
            F
          </kbd>
        </div>
      </button>
    </>
  );
};
