"use client";

import React from "react";
import { getInitialViewMode, saveViewMode, type TimeEntryViewMode } from "../TimeEntryViewToggle";

interface TimeEntryViewContextType {
  viewMode: TimeEntryViewMode;
  setViewMode: (view: TimeEntryViewMode) => void;
}

const TimeEntryViewContext = React.createContext<TimeEntryViewContextType | undefined>(undefined);

export const TimeEntryViewProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewMode, setViewModeState] = React.useState<TimeEntryViewMode>(() => getInitialViewMode());

  const setViewMode = React.useCallback((view: TimeEntryViewMode) => {
    setViewModeState(view);
    saveViewMode(view);
  }, []);

  return (
    <TimeEntryViewContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </TimeEntryViewContext.Provider>
  );
};

export const useTimeEntryView = () => {
  const context = React.useContext(TimeEntryViewContext);
  if (context === undefined) {
    throw new Error("useTimeEntryView must be used within a TimeEntryViewProvider");
  }
  return context;
};
