import React from "react";

export type TicketViewMode = "table" | "card";

const VIEW_MODE_KEY = "ticket-view-mode";

interface TicketViewContextType {
  viewMode: TicketViewMode;
  setViewMode: (mode: TicketViewMode) => void;
}

const TicketViewContext = React.createContext<TicketViewContextType>({
  viewMode: "table",
  setViewMode: () => {},
});

export function TicketViewProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = React.useState<TicketViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === "table" || stored === "card") return stored;
    } catch {}
    return "table";
  });

  const setViewMode = React.useCallback((mode: TicketViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch {}
  }, []);

  return (
    <TicketViewContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </TicketViewContext.Provider>
  );
}

export function useTicketView() {
  return React.useContext(TicketViewContext);
}
