"use client";

import React from "react";
import { getInitialViewMode, saveViewMode, type TicketViewMode } from "../TicketViewToggle";

interface TicketViewContextType {
  viewMode: TicketViewMode;
  setViewMode: (view: TicketViewMode) => void;
}

const TicketViewContext = React.createContext<TicketViewContextType | undefined>(undefined);

export const TicketViewProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewMode, setViewModeState] = React.useState<TicketViewMode>(() => getInitialViewMode());

  const setViewMode = React.useCallback((view: TicketViewMode) => {
    setViewModeState(view);
    saveViewMode(view);
  }, []);

  return (
    <TicketViewContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </TicketViewContext.Provider>
  );
};

export const useTicketView = () => {
  const context = React.useContext(TicketViewContext);
  if (context === undefined) {
    throw new Error("useTicketView must be used within a TicketViewProvider");
  }
  return context;
};
