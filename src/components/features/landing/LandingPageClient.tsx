"use client";

import { useEffect, useState, ReactNode } from "react";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";
import { OfflineWarning } from "@/components/ui/OfflineWarning";

interface LandingPageClientProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
}

/**
 * Client wrapper component that monitors database health and updates the page
 * when database status changes without requiring a page refresh.
 * This component also monitors online/offline status and displays a warning banner.
 */
export function LandingPageClient({ children, initialDatabaseAvailable }: LandingPageClientProps) {
  const { status } = useDatabaseHealth({
    pollInterval: 30000, // Check every 30 seconds
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
    onStatusChange: (newStatus, wasUnhealthy) => {
      // If database just came back online, log for debugging
      if (wasUnhealthy && (newStatus === "healthy" || newStatus === "degraded")) {
        console.log("Database connection restored");
      }
    },
  });

  // Monitor online/offline status
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    // Initialize with navigator.onLine if available, default to true
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    // Set initial online status
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const initialOnlineStatus = navigator.onLine;
      setIsOnline(initialOnlineStatus);
      console.log("Initial online status:", initialOnlineStatus);
    }

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      console.log("Connection restored - banner should hide");
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log("Connection lost - banner should show");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Adjust Hero section padding based on online/offline status
  // When online: Hero has pt-16 (64px) for header
  // When offline: Header is hidden, only need padding for offline banner (~73px)
  useEffect(() => {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        // Find the Hero section (first section in main-content)
        const heroSection = mainContent.querySelector("section");
        if (heroSection) {
          if (!isOnline) {
            // When offline: Header is hidden, only need padding for banner (~73px)
            heroSection.style.paddingTop = "73px";
            heroSection.style.transition = "padding-top 0.3s ease";
          } else {
            // When online: Reset to default (pt-16 = 64px for header)
            heroSection.style.paddingTop = "";
          }
        }
      }
    }
  }, [isOnline]);

  // Debug: log when banner should be visible
  useEffect(() => {
    console.log("isOnline state:", isOnline, "Banner should be visible:", !isOnline);
  }, [isOnline]);

  return (
    <>
      {/* Show offline warning banner at the top when offline */}
      {!isOnline && (
        <div 
          className="fixed top-0 left-0 right-0 z-[110] w-full"
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 110,
            width: '100%'
          }}
        >
          <OfflineWarning />
        </div>
      )}
      {children}
    </>
  );
}
