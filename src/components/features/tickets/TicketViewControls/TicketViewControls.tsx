"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { useTicketView } from "../TicketViewContext";
import { TicketViewDialog } from "../TicketViewDialog";

const getViewModeLabel = (view: string): string => {
  switch (view) {
    case "normal":
      return "Normal";
    case "detailed":
      return "Detailed";
    case "compact":
      return "Compact";
    case "title-only":
      return "Title Only";
    default:
      return "View";
  }
};

const getViewModeIcon = (view: string) => {
  switch (view) {
    case "normal":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "detailed":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "compact":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case "title-only":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
  }
};

export const TicketViewControls = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { viewMode, setViewMode } = useTicketView();

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        {getViewModeIcon(viewMode)}
        <span className="ml-2">{getViewModeLabel(viewMode)}</span>
      </Button>

      <TicketViewDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        currentView={viewMode}
        onViewChange={setViewMode}
      />
    </>
  );
};
