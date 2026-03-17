"use client";

import React from "react";
import { getInitialViewMode, saveViewMode, type TimeEntryViewMode } from "../TimeEntryViewToggle";
import { getViewPreference, saveViewPreference } from "@/server/actions/view-preferences";

interface TimeEntryViewContextType {
  viewMode: TimeEntryViewMode;
  setViewMode: (view: TimeEntryViewMode) => void;
  isReady: boolean; // Whether the view mode has been loaded from localStorage and is ready to render
}

const TimeEntryViewContext = React.createContext<TimeEntryViewContextType | undefined>(undefined);

export const TimeEntryViewProvider = ({ children }: { children: React.ReactNode }) => {
  // Initialize with isReady: true and viewMode "table" so server and client render the same HTML (avoids hydration mismatch).
  // useLayoutEffect then loads viewMode from localStorage and updates state.
  const [viewState, setViewState] = React.useState<{
    viewMode: TimeEntryViewMode;
    isReady: boolean;
  }>({
    viewMode: "table",
    isReady: true,
  });
  
  const [mounted, setMounted] = React.useState(false);
  const [synced, setSynced] = React.useState(false);
  const userChangedRef = React.useRef(false);
  const syncInProgressRef = React.useRef(false);
  const localStorageValueRef = React.useRef<TimeEntryViewMode>(viewState.viewMode);
  const initializedRef = React.useRef(false);

  // Load from localStorage and mark as ready after mount (before paint)
  // This runs synchronously before the browser paints, so no flash should be visible
  React.useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    // Ensure we have the latest value from localStorage
    const localViewMode = getInitialViewMode();
    localStorageValueRef.current = localViewMode;
    
    // Update state to mark as ready (viewMode should already be correct from initializer)
    // This happens before paint, so the user should only see the correct view
    setViewState((prev) => ({ ...prev, viewMode: localViewMode }));
    setMounted(true);
  }, []);

  // Sync with database after mount (pull change from database → check against localStorage → if different, update localStorage → then load)
  React.useEffect(() => {
    if (!mounted || syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    
    const syncFromDatabase = async () => {
      try {
        // Step 1: Pull change from database
        const dbPreference = await getViewPreference("timeEntry");
        
        // Step 2: Check against localStorage (get current value from ref)
        const currentLocalViewMode = localStorageValueRef.current || getInitialViewMode();
        
        if (dbPreference && (dbPreference === "table" || dbPreference === "card")) {
          const dbViewMode = dbPreference as TimeEntryViewMode;
          
          // Step 3: If different, update localStorage first, then load
          if (dbViewMode !== currentLocalViewMode) {
            // Database has a different value - update localStorage to match database
            saveViewMode(dbViewMode);
            localStorageValueRef.current = dbViewMode;
            // Then update state to load the new value
            setViewState((prev) => ({ ...prev, viewMode: dbViewMode }));
          }
          // If same, no update needed - state is already correct
        } else {
          // No database preference - save current localStorage value to database
          if (currentLocalViewMode) {
            try {
              await saveViewPreference("timeEntry", currentLocalViewMode);
            } catch (saveError) {
              console.error("Error saving localStorage value to database:", saveError);
            }
          }
        }
      } catch (dbError) {
        console.error("Error syncing view preference with database:", dbError);
        // Continue with localStorage value if database fails
      } finally {
        setSynced(true);
        syncInProgressRef.current = false;
      }
    };

    syncFromDatabase();
  }, [mounted]);

  // Set up unload handlers
  React.useEffect(() => {
    if (!mounted) return;
    
    // Ensure localStorage is saved before page unload (important for mobile)
    const handleBeforeUnload = () => {
      const currentMode = localStorageValueRef.current || getInitialViewMode();
      if (currentMode) {
        saveViewMode(currentMode);
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload); // For mobile browsers
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [mounted]);

  const setViewMode = React.useCallback(async (view: TimeEntryViewMode) => {
    // Mark that user has manually changed the view
    userChangedRef.current = true;
    
    // Step 1: Update localStorage first (local change)
    saveViewMode(view);
    
    // Update ref to track localStorage value
    localStorageValueRef.current = view;
    
    // Verify localStorage was saved
    const verifyLocal = getInitialViewMode();
    if (verifyLocal !== view) {
      console.error("Failed to save view mode to localStorage, retrying...");
      // Retry once
      saveViewMode(view);
      const retryVerify = getInitialViewMode();
      if (retryVerify !== view) {
        console.error("Failed to save view mode to localStorage after retry");
        // Still continue even if localStorage fails
      } else {
        localStorageValueRef.current = view;
      }
    }
    
    // Step 2: Update view state (load the new value)
    setViewState((prev) => ({ ...prev, viewMode: view }));
    
    // Step 3: Push change to database (after localStorage is updated)
    try {
      const result = await saveViewPreference("timeEntry", view);
      if (!result.success) {
        console.error("Failed to save view preference to database:", result.error);
      }
    } catch (error) {
      console.error("Error saving view preference to database:", error);
    }
  }, []);

  return (
    <TimeEntryViewContext.Provider value={{ viewMode: viewState.viewMode, setViewMode, isReady: viewState.isReady }}>
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
