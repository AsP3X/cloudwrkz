"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export type TimeEntryViewMode = "table" | "card";

const VIEW_MODE_STORAGE_KEY = "time-entry-view-mode";

interface TimeEntryViewToggleProps {
  currentView: TimeEntryViewMode;
  onViewChange: (view: TimeEntryViewMode) => void;
}

const viewModes: Array<{ value: TimeEntryViewMode; label: string; icon: React.ReactNode }> = [
  {
    value: "table",
    label: "Table",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "card",
    label: "Card",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
];

export const TimeEntryViewToggle = ({ currentView, onViewChange }: TimeEntryViewToggleProps) => {
  return (
    <div className="inline-flex rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1" role="group" aria-label="Time entry view options">
      {viewModes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onViewChange(mode.value)}
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            currentView === mode.value
              ? "bg-primary-600 text-white shadow-sm"
              : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-700"
          )}
          aria-pressed={currentView === mode.value}
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
};

// Helper function to get initial view mode from localStorage
export const getInitialViewMode = (): TimeEntryViewMode => {
  if (typeof window === "undefined") return "table";
  
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ["table", "card"].includes(stored)) {
      return stored as TimeEntryViewMode;
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  
  return "table";
};

// Helper function to save view mode to localStorage
export const saveViewMode = (view: TimeEntryViewMode): void => {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
  } catch (error) {
    // Ignore localStorage errors
  }
};
