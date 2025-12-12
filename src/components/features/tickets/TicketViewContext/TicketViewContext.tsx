"use client";

import React from "react";
import { getInitialViewMode, saveViewMode, type TicketViewMode } from "../TicketViewToggle";
import { getViewPreference, saveViewPreference } from "@/server/actions/view-preferences";

interface TicketViewContextType {
  viewMode: TicketViewMode;
  setViewMode: (view: TicketViewMode) => void;
}

const TicketViewContext = React.createContext<TicketViewContextType | undefined>(undefined);

export const TicketViewProvider = ({ children }: { children: React.ReactNode }) => {
  // Initialize with safe default to prevent hydration mismatch
  // Load from localStorage after mount
  const [viewMode, setViewModeState] = React.useState<TicketViewMode>("table");
  const [mounted, setMounted] = React.useState(false);
  const [synced, setSynced] = React.useState(false);

  // Load view mode from localStorage first (for immediate display)
  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = getInitialViewMode();
      setViewModeState(stored);
    } catch {
      // Ignore errors, use default
    }
  }, []);

  // Sync with database after mount
  React.useEffect(() => {
    if (!mounted || synced) return;

    const syncWithDatabase = async () => {
      try {
        // Get preference from database
        const dbPreference = await getViewPreference("ticket");
        
        if (dbPreference && (dbPreference === "table" || dbPreference === "card")) {
          const dbViewMode = dbPreference as TicketViewMode;
          const localViewMode = getInitialViewMode();
          
          // If database has a different preference, sync it
          if (dbViewMode !== localViewMode) {
            setViewModeState(dbViewMode);
            saveViewMode(dbViewMode);
          }
        }
        
        setSynced(true);
      } catch (error) {
        console.error("Error syncing view preference with database:", error);
        setSynced(true); // Mark as synced even on error to prevent retries
      }
    };

    syncWithDatabase();
  }, [mounted, synced]);

  const setViewMode = React.useCallback(async (view: TicketViewMode) => {
    setViewModeState(view);
    saveViewMode(view); // Save to localStorage immediately
    
    // Save to database asynchronously
    try {
      await saveViewPreference("ticket", view);
    } catch (error) {
      console.error("Error saving view preference to database:", error);
      // Don't block the UI update if database save fails
    }
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
