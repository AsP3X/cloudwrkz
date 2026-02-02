"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const contentRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => setShowBanner(false), []);

  // When server is unavailable, set inert on page content so all interactivity is blocked (clicks + keyboard)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (showBanner) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [showBanner]);

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
      {/* When server is unavailable, inert blocks all page interaction (clicks + keyboard) like login FormBlurWrapper */}
      <div ref={contentRef}>
        {children}
      </div>
      {showBanner && (
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]"
            style={{ pointerEvents: "auto" }}
            aria-hidden="true"
          />
          <div className="fixed top-0 left-0 right-0 z-[9999]">
            <ServerUnavailableBanner onDismiss={dismiss} dismissible />
          </div>
        </>
      )}
    </>
  );
}
