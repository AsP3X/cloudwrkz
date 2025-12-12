"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";
import type { DatabaseHealthStatus } from "@/lib/hooks/useDatabaseHealth";

interface DatabaseHealthContextType {
  status: DatabaseHealthStatus;
  isServerUnreachable: boolean;
  error: string | null;
  isConnected: boolean;
  lastChecked: Date | null;
}

export const DatabaseHealthContext = createContext<DatabaseHealthContextType | undefined>(undefined);

interface DatabaseHealthProviderProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
  pollInterval?: number;
}

export function DatabaseHealthProvider({ 
  children, 
  initialDatabaseAvailable,
  pollInterval = 30000 
}: DatabaseHealthProviderProps) {
  const { status, isServerUnreachable, error, isConnected, lastChecked } = useDatabaseHealth({
    pollInterval,
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
  });

  return (
    <DatabaseHealthContext.Provider value={{ status, isServerUnreachable, error, isConnected, lastChecked }}>
      {children}
    </DatabaseHealthContext.Provider>
  );
}

export function useDatabaseHealthContext(): DatabaseHealthContextType {
  const context = useContext(DatabaseHealthContext);
  if (context === undefined) {
    throw new Error("useDatabaseHealthContext must be used within a DatabaseHealthProvider");
  }
  return context;
}

/**
 * Safely try to use database health context, returns null if not available
 */
export function useDatabaseHealthContextSafe(): DatabaseHealthContextType | null {
  const context = useContext(DatabaseHealthContext);
  return context ?? null;
}
