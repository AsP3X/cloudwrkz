"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export type ProjectViewMode = "grid" | "list" | "card";

const VIEW_MODE_STORAGE_KEY = "project-view-mode";

interface ProjectViewToggleProps {
  currentView: ProjectViewMode;
  onViewChange: (view: ProjectViewMode) => void;
}

const viewModes: Array<{ value: ProjectViewMode; label: string; icon: React.ReactNode }> = [
  {
    value: "grid",
    label: "Grid",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    value: "list",
    label: "List",
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

export const ProjectViewToggle = ({ currentView, onViewChange }: ProjectViewToggleProps) => {
  return (
    <div className="inline-flex rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1" role="group" aria-label="Project view options" suppressHydrationWarning>
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
          suppressHydrationWarning
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
};

// Helper function to get initial view mode from localStorage
export const getInitialViewMode = (): ProjectViewMode => {
  if (typeof window === "undefined") return "grid";
  
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ["grid", "list", "card"].includes(stored)) {
      return stored as ProjectViewMode;
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  
  return "grid";
};

// Helper function to save view mode to localStorage
export const saveViewMode = (view: ProjectViewMode): void => {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
    // Verify it was saved (important for mobile browsers)
    const verify = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (verify !== view) {
      console.error("Failed to persist view mode to localStorage");
    }
  } catch (error) {
    console.error("Error saving view mode to localStorage:", error);
  }
};
