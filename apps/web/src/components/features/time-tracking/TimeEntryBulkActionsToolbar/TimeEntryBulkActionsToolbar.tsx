"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { type TimeEntryStatus } from "@/generated/prisma";

interface TimeEntryBulkActionsToolbarProps {
  selectedCount: number;
  onBulkStatusChange: (status: TimeEntryStatus) => void;
  onBulkTag: () => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

const statusOptions: Array<{ value: TimeEntryStatus; label: string }> = [
  { value: "STOPPED", label: "Stop" },
  { value: "COMPLETED", label: "Complete" },
];

export const TimeEntryBulkActionsToolbar = ({
  selectedCount,
  onBulkStatusChange,
  onBulkTag,
  onBulkArchive,
  onBulkDelete,
  onClearSelection,
}: TimeEntryBulkActionsToolbarProps) => {
  const [showStatusMenu, setShowStatusMenu] = React.useState(false);
  const statusMenuRef = React.useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(event.target as Node)
      ) {
        setShowStatusMenu(false);
      }
    };

    if (typeof window === "undefined" || typeof document === "undefined") return;

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", handleClickOutside);
      }
    };
  }, []);

  const handleStatusSelect = (status: TimeEntryStatus) => {
    onBulkStatusChange(status);
    setShowStatusMenu(false);
  };

  return (
    <div className="bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {selectedCount} entr{selectedCount !== 1 ? "ies" : "y"} selected
        </span>
        <div className="hidden sm:block h-6 w-px bg-neutral-300 dark:bg-neutral-600" />
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Change Dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="text-sm"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Change Status
            </Button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 z-[9999] overflow-hidden">
                <div className="overflow-y-auto overscroll-contain scrollbar-thin py-1" style={{ maxHeight: '200px', minHeight: 'auto' }}>
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleStatusSelect(option.value)}
                      className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tag Management Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkTag}
            className="text-sm"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            Manage Tags
          </Button>

          {/* Archive Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkArchive}
            className="text-sm"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-2 12H6L4 7m16 0H4m16 0l-1-3H5L4 7m6 4h4"
              />
            </svg>
            Archive
          </Button>

          {/* Delete Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkDelete}
            className="text-sm text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:text-red-300"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="text-sm w-full sm:w-auto"
      >
        Clear Selection
      </Button>
    </div>
  );
};
