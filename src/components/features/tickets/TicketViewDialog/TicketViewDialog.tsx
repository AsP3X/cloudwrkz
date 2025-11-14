"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { TicketViewMode } from "../TicketViewToggle";

interface TicketViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentView: TicketViewMode;
  onViewChange: (view: TicketViewMode) => void;
}

const viewModes: Array<{ value: TicketViewMode; label: string; description: string; icon: React.ReactNode }> = [
  {
    value: "normal",
    label: "Normal",
    description: "Standard view with title, description preview, and badges",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Expanded view with full description and comprehensive metadata",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    value: "compact",
    label: "Compact",
    description: "Minimal view showing only essential information",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: "title-only",
    label: "Title Only",
    description: "Ultra-compact view with just ticket number, title, and status",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
      </svg>
    ),
  },
];

export const TicketViewDialog = ({ open, onOpenChange, currentView, onViewChange }: TicketViewDialogProps) => {
  const handleSelect = (view: TicketViewMode) => {
    onViewChange(view);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Select View Mode"
      description="Choose how you want to display tickets"
    >
      <div className="p-6">
        <div className="space-y-2">
          {viewModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              className={cn(
                "w-full flex items-start gap-4 p-4 rounded-lg border-2 transition-all duration-200 text-left",
                "hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                currentView === mode.value
                  ? "border-primary-500 bg-primary-50"
                  : "border-neutral-200 bg-white"
              )}
            >
              <div
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                  currentView === mode.value
                    ? "bg-primary-600 text-white"
                    : "bg-neutral-100 text-neutral-600"
                )}
              >
                {mode.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-neutral-900">{mode.label}</h3>
                  {currentView === mode.value && (
                    <span className="px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-1">{mode.description}</p>
              </div>
              {currentView === mode.value && (
                <svg
                  className="w-5 h-5 text-primary-600 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
