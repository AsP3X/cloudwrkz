"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

export type TicketViewMode = "normal" | "detailed" | "compact" | "title-only";

const VIEW_MODE_STORAGE_KEY = "ticket-view-mode";

interface TicketViewToggleProps {
  currentView: TicketViewMode;
  onViewChange: (view: TicketViewMode) => void;
}

const viewModes: Array<{ value: TicketViewMode; label: string; icon: React.ReactNode }> = [
  {
    value: "normal",
    label: "Normal",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "detailed",
    label: "Detailed",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    value: "compact",
    label: "Compact",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "title-only",
    label: "Title Only",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
      </svg>
    ),
  },
];

export const TicketViewToggle = ({ currentView, onViewChange }: TicketViewToggleProps) => {
  return (
    <div className="inline-flex rounded-lg border-2 border-neutral-200 bg-white p-1" role="group" aria-label="Ticket view options">
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
              : "text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100"
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
export const getInitialViewMode = (): TicketViewMode => {
  if (typeof window === "undefined") return "normal";
  
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ["normal", "detailed", "compact", "title-only"].includes(stored)) {
      return stored as TicketViewMode;
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  
  return "normal";
};

// Helper function to save view mode to localStorage
export const saveViewMode = (view: TicketViewMode): void => {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
  } catch (error) {
    // Ignore localStorage errors
  }
};
