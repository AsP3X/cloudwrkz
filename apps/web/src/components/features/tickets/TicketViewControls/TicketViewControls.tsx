"use client";

import React from "react";
import { useTicketView } from "../TicketViewContext";
import { TicketViewToggle } from "../TicketViewToggle";

export const TicketViewControls = () => {
  const { viewMode, setViewMode } = useTicketView();

  return (
    <TicketViewToggle currentView={viewMode} onViewChange={setViewMode} />
  );
};
