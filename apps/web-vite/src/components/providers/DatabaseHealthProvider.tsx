// Human: Thin context wrapper around `useDatabaseHealth` so any subtree can read database connectivity without prop drilling.
// Agent: CALLS useDatabaseHealth({ pollInterval }); PROVIDES status, error, isServerUnreachable, checkHealth; useDatabaseHealthContext may return null.
import React, { createContext, useContext } from "react";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";
import type { DatabaseHealthStatus } from "@/lib/hooks/useDatabaseHealth";

type DatabaseHealthContextType = {
  status: DatabaseHealthStatus;
  error: string | null;
  isServerUnreachable: boolean;
  isConnected: boolean;
  checkHealth: () => Promise<void>;
};

const DatabaseHealthContext = createContext<DatabaseHealthContextType | null>(null);

export function DatabaseHealthProvider({
  children,
  pollInterval = 30000,
}: {
  children: React.ReactNode;
  pollInterval?: number;
}) {
  const health = useDatabaseHealth({ pollInterval });
  const value: DatabaseHealthContextType = {
    ...health,
    checkHealth: health.checkHealth,
  };
  return (
    <DatabaseHealthContext.Provider value={value}>
      {children}
    </DatabaseHealthContext.Provider>
  );
}

export function useDatabaseHealthContext(): DatabaseHealthContextType | null {
  return useContext(DatabaseHealthContext);
}
