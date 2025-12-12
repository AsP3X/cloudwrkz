"use client";

import React from "react";
import { useTicketView } from "../TicketViewContext";
import { TicketViewToggle } from "../TicketViewToggle";

export const TicketViewControls = () => {
  const { viewMode, setViewMode, isReady } = useTicketView();

  // Don't render until ready to prevent showing wrong state
  if (!isReady) {
    return null;
  }

  return (
    <TicketViewToggle currentView={viewMode} onViewChange={setViewMode} />
  );
};
