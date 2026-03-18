import React from "react";
import { Button } from "@/components/ui/Button";

interface TodoBulkActionsToolbarProps {
  selectedCount: number;
  onBulkStatusChange: (status: string) => void;
  onBulkPriorityChange: (priority: string) => void;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  variant?: "bar" | "inline";
}

const statusOptions = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const priorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export const TodoBulkActionsToolbar = ({
  selectedCount,
  onBulkStatusChange,
  onBulkPriorityChange,
  onBulkArchive,
  onBulkDelete,
  onClearSelection,
  variant = "bar",
}: TodoBulkActionsToolbarProps) => {
  const [showStatusMenu, setShowStatusMenu] = React.useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = React.useState(false);
  const statusMenuRef = React.useRef<HTMLDivElement>(null);
  const priorityMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(event.target as Node)
      ) {
        setShowStatusMenu(false);
      }
      if (
        priorityMenuRef.current &&
        !priorityMenuRef.current.contains(event.target as Node)
      ) {
        setShowPriorityMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleStatusSelect = (status: string) => {
    onBulkStatusChange(status);
    setShowStatusMenu(false);
  };

  const handlePrioritySelect = (priority: string) => {
    onBulkPriorityChange(priority);
    setShowPriorityMenu(false);
  };

  const containerClassName =
    variant === "inline"
      ? "flex flex-wrap items-center justify-end gap-2"
      : "bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4";

  return (
    <div className={containerClassName}>
      {variant === "bar" ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {selectedCount} todo{selectedCount !== 1 ? "s" : ""} selected
            </span>
            <div className="hidden sm:block h-6 w-px bg-neutral-300 dark:bg-neutral-600" />
            <div className="flex flex-wrap items-center gap-2">
            {/* Status Change Dropdown */}
            <div className="relative" ref={statusMenuRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowStatusMenu(!showStatusMenu);
                  setShowPriorityMenu(false);
                }}
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
                  <div
                    className="overflow-y-auto overscroll-contain scrollbar-thin py-1"
                    style={{ maxHeight: "200px", minHeight: "auto" }}
                  >
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

            {/* Priority Change Dropdown */}
            <div className="relative" ref={priorityMenuRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPriorityMenu(!showPriorityMenu);
                  setShowStatusMenu(false);
                }}
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Change Priority
              </Button>
              {showPriorityMenu && (
                <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 z-[9999] overflow-hidden">
                  <div
                    className="overflow-y-auto overscroll-contain scrollbar-thin py-1"
                    style={{ maxHeight: "200px", minHeight: "auto" }}
                  >
                    {priorityOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handlePrioritySelect(option.value)}
                        className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                  d="M9 12l2 2 4-4m5-6H4a2 2 0 00-2 2v2a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zM5 10v10a2 2 0 002 2h10a2 2 0 002-2V10"
                />
              </svg>
              Archive (Complete)
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
        </>
      ) : (
        <>
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mr-1">
            {selectedCount} selected
          </span>
          {/* Status Change Dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowStatusMenu(!showStatusMenu);
                setShowPriorityMenu(false);
              }}
              className="text-sm"
            >
              Change Status
            </Button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 z-[9999] overflow-hidden">
                <div
                  className="overflow-y-auto overscroll-contain scrollbar-thin py-1"
                  style={{ maxHeight: "200px", minHeight: "auto" }}
                >
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

          {/* Priority Change Dropdown */}
          <div className="relative" ref={priorityMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowPriorityMenu(!showPriorityMenu);
                setShowStatusMenu(false);
              }}
              className="text-sm"
            >
              Change Priority
            </Button>
            {showPriorityMenu && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 z-[9999] overflow-hidden">
                <div
                  className="overflow-y-auto overscroll-contain scrollbar-thin py-1"
                  style={{ maxHeight: "200px", minHeight: "auto" }}
                >
                  {priorityOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handlePrioritySelect(option.value)}
                      className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onBulkArchive}
            className="text-sm"
          >
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkDelete}
            className="text-sm text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:text-red-300"
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="text-sm">
            Clear
          </Button>
        </>
      )}
    </div>
  );
};
