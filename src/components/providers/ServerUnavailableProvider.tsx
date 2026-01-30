"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ServerUnavailableBanner } from "@/components/ui/ServerUnavailableBanner";
import { isServerUnavailableError } from "@/lib/utils/server-action-utils";

interface ServerUnavailableProviderProps {
  children: React.ReactNode;
}

/**
 * Listens for unhandled promise rejections (e.g. server action failures when the server
 * disconnects or crashes) and shows a dismissible banner instead of only logging to console.
 */
export function ServerUnavailableProvider({ children }: ServerUnavailableProviderProps) {
  const [showBanner, setShowBanner] = useState(false);

  const dismiss = useCallback(() => setShowBanner(false), []);

  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const error = event?.reason;
      if (isServerUnavailableError(error)) {
        setShowBanner(true);
        // Prevent the default console error for this known case so the user sees the banner instead
        event.preventDefault?.();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <>
      {showBanner && <ServerUnavailableBanner onDismiss={dismiss} dismissible />}
      {children}
    </>
  );
}
