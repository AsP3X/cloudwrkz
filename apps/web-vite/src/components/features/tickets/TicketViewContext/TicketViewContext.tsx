import React from "react";

// Human: React UI for `TicketViewProvider` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketViewProvider; REACT component; READS props hooks; MAY CALL api client.
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
