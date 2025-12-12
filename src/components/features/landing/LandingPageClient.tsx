"use client";

import { useEffect, useState, ReactNode } from "react";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";

interface LandingPageClientProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
}

/**
 * Client wrapper component that monitors database health and updates the page
 * when database status changes without requiring a page refresh.
 * This component provides the database health context to child components.
 */
export function LandingPageClient({ children, initialDatabaseAvailable }: LandingPageClientProps) {
  const { status } = useDatabaseHealth({
    pollInterval: 10000, // Check every 10 seconds
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
    onStatusChange: (newStatus, wasUnhealthy) => {
      // If database just came back online, log for debugging
      if (wasUnhealthy && (newStatus === "healthy" || newStatus === "degraded")) {
        console.log("Database connection restored");
      }
    },
  });

  // Simply render children - Header will use the hook internally
  return <>{children}</>;
}
