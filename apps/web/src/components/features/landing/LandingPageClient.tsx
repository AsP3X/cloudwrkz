"use client";

import { useEffect, useState, ReactNode } from "react";
import { OfflineWarning } from "@/components/ui/OfflineWarning";
import { DatabaseHealthProvider } from "@/components/providers/DatabaseHealthProvider";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";

interface LandingPageClientProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
}

/**
 * Client wrapper component that monitors online/offline status and displays a warning banner.
 * Provides a shared database health context so Header and Footer can share the same health check result.
 */
export function LandingPageClient({ children, initialDatabaseAvailable }: LandingPageClientProps) {

  // Monitor online/offline status
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    // Initialize with navigator.onLine if available, default to true
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
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
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    // Find the Hero section (first section in main-content)
    const heroSection = mainContent.querySelector("section");
    if (!heroSection) return;

    if (!isOnline) {
      // When offline: Header is hidden, only need padding for banner (~73px)
      heroSection.style.paddingTop = "73px";
      heroSection.style.transition = "padding-top 0.3s ease";
    } else {
      // When online: Reset to default (pt-16 = 64px for header)
      heroSection.style.paddingTop = "";
      heroSection.style.transition = "padding-top 0.3s ease";
    }
  }, [isOnline]);


  return (
    <ErrorBoundary>
      <DatabaseHealthProvider initialDatabaseAvailable={initialDatabaseAvailable} pollInterval={30000}>
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
      </DatabaseHealthProvider>
    </ErrorBoundary>
  );
}
