"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ServerUnavailableBanner } from "@/components/ui/ServerUnavailableBanner";
import { isServerUnavailableError } from "@/lib/utils/server-action-utils";

interface ServerUnavailableProviderProps {
  children: React.ReactNode;
}

const SERVER_UNAVAILABLE_EVENT = "serverunavailable";

/**
 * Listens for unhandled promise rejections (e.g. server action failures when the server
 * disconnects or crashes) and shows a dismissible banner instead of only logging to console.
 * Also listens for the custom 'serverunavailable' event dispatched by the early inline script
 * when a rejection was handled before React mounted.
 */
export function ServerUnavailableProvider({ children }: ServerUnavailableProviderProps) {
  const [showBanner, setShowBanner] = useState(false);

  const dismiss = useCallback(() => setShowBanner(false), []);

  useEffect(() => {
    const showBannerIfServerUnavailable = (error: unknown) => {
      if (isServerUnavailableError(error)) setShowBanner(true);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const error = event?.reason;
      if (isServerUnavailableError(error)) {
        setShowBanner(true);
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }
    };

    const handleServerUnavailableEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      showBannerIfServerUnavailable(customEvent.detail);
    };

    if (typeof window !== "undefined" && (window as unknown as { __serverUnavailableReason?: unknown }).__serverUnavailableReason != null) {
      const reason = (window as unknown as { __serverUnavailableReason?: unknown }).__serverUnavailableReason;
      showBannerIfServerUnavailable(reason);
      delete (window as unknown as { __serverUnavailableReason?: unknown }).__serverUnavailableReason;
    }

    window.addEventListener("unhandledrejection", handleRejection, true);
    window.addEventListener(SERVER_UNAVAILABLE_EVENT, handleServerUnavailableEvent);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection, true);
      window.removeEventListener(SERVER_UNAVAILABLE_EVENT, handleServerUnavailableEvent);
    };
  }, []);

  return (
    <>
      {showBanner && <ServerUnavailableBanner onDismiss={dismiss} dismissible />}
      {children}
    </>
  );
}
