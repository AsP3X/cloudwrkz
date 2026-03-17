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

function getStoredViewMode(): LinkViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ["table", "list", "card"].includes(stored)) return stored as LinkViewMode;
  } catch {
    // Ignore localStorage errors
  }
  return "table";
}

export function LinkViewProvider({ children }: { children: React.ReactNode }) {
  // Use deterministic initial state so server and client render the same HTML (avoids hydration mismatch).
  // viewMode is "table" until we read localStorage in useEffect.
  const [viewState, setViewState] = React.useState<{
    viewMode: LinkViewMode;
    isReady: boolean;
  }>({
    viewMode: "table",
    isReady: true,
  });

  React.useEffect(() => {
    const stored = getStoredViewMode();
    setViewState((prev) => ({ ...prev, viewMode: stored }));
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
