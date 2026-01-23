"use client";

import React from "react";

export type LinkViewMode = "table" | "list" | "card";

const VIEW_MODE_STORAGE_KEY = "link-view-mode";

interface LinkViewContextType {
  viewMode: LinkViewMode;
  setViewMode: (mode: LinkViewMode) => void;
  isReady: boolean;
}

const LinkViewContext = React.createContext<LinkViewContextType | undefined>(undefined);

function getInitialViewMode(): LinkViewMode {
  if (typeof window === "undefined") {
    return "table";
  }
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ["table", "list", "card"].includes(stored)) {
      return stored as LinkViewMode;
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  return "table";
}

export function LinkViewProvider({ children }: { children: React.ReactNode }) {
  // Initialize state: always start with isReady: false for SSR/hydration consistency
  // Both server and client will render nothing initially (isReady: false)
  // Then on client, useLayoutEffect will load from localStorage and set isReady: true
  const [viewState, setViewState] = React.useState<{
    viewMode: LinkViewMode;
    isReady: boolean;
  }>(() => {
    // On server, always use "table" and not ready
    if (typeof window === "undefined") {
      return {
        viewMode: "table",
        isReady: false,
      };
    }
    
    // On client, also start with isReady: false to match server
    // We'll load from localStorage in useLayoutEffect to prevent hydration mismatch
    // But we can still read the value now to initialize viewMode correctly
    const localViewMode = getInitialViewMode();
    return {
      viewMode: localViewMode, // Initialize with correct value
      isReady: false, // But don't render until after hydration
    };
  });

  React.useLayoutEffect(() => {
    // Load from localStorage and mark as ready after mount (before paint)
    // This runs synchronously before the browser paints, so no flash should be visible
    const localViewMode = getInitialViewMode();
    setViewState({
      viewMode: localViewMode,
      isReady: true,
    });
  }, []);

  const setViewMode = React.useCallback((mode: LinkViewMode) => {
    setViewState((prev) => ({ ...prev, viewMode: mode }));
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
      console.error("Error saving view mode to localStorage:", error);
    }
  }, []);

  return (
    <LinkViewContext.Provider value={{ viewMode: viewState.viewMode, setViewMode, isReady: viewState.isReady }}>
      {children}
    </LinkViewContext.Provider>
  );
}

export function useLinkView() {
  const context = React.useContext(LinkViewContext);
  if (context === undefined) {
    throw new Error("useLinkView must be used within a LinkViewProvider");
  }
  return context;
}
