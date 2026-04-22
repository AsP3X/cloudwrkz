import React from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui/Dialog";
import { DurationDisplay } from "../DurationDisplay";
import { getStatusColor, getStatusLabel, formatTimerNumber } from "@/lib/utils/time-tracking";
import { api } from "@/api/client";
import type { TimeEntry } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `FloatingTimerWidget` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS FloatingTimerWidget; REACT component; READS props hooks; MAY CALL api client.
const WIDGET_PREF_KEY = "timer-widget-preference";
type WidgetPreference = "floating" | "dialog";

function getWidgetPreference(): WidgetPreference {
  try {
    const stored = localStorage.getItem(WIDGET_PREF_KEY);
    if (stored === "floating" || stored === "dialog") return stored;
  } catch {}
  return "floating";
}

interface FloatingTimerWidgetProps {
  activeEntries: TimeEntry[];
  onRefresh?: () => void;
}

export function FloatingTimerWidget({ activeEntries, onRefresh }: FloatingTimerWidgetProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showDialog, setShowDialog] = React.useState(false);
  const [processing, setProcessing] = React.useState<Set<string>>(new Set());
  const [mounted, setMounted] = React.useState(false);
  const [bodyElement, setBodyElement] = React.useState<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  const [timerWidgetPreference] = React.useState<WidgetPreference>(() => getWidgetPreference());

  React.useEffect(() => {
    setMounted(true);
    if (document.body) {
      setBodyElement(document.body);

      const checkMobile = () => {
        const width = window.innerWidth;
        const isMobileWidth = width < 640;
        const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        setIsMobile(isMobileWidth || (isTouchDevice && width < 768));
      };

      checkMobile();
      window.addEventListener("resize", checkMobile);
      window.addEventListener("orientationchange", checkMobile);
      return () => {
        window.removeEventListener("resize", checkMobile);
        window.removeEventListener("orientationchange", checkMobile);
      };
    }
  }, []);

  const handlePause = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/pause`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleResume = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/resume`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleStop = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/stop`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleWidgetClick = React.useCallback(() => {
    if (timerWidgetPreference === "dialog") {
      setShowDialog(true);
      setIsExpanded(false);
    } else if (timerWidgetPreference === "floating") {
      setIsExpanded(true);
      setShowDialog(false);
    }
  }, [timerWidgetPreference]);

  if (!mounted || activeEntries.length === 0 || !bodyElement) {
    return null;
  }

  const timerList = (
    <div className="overflow-y-auto">
        {activeEntries.map((entry) => {
          const isProcessingEntry = processing.has(entry.id);
          return (
            <div
              key={entry.id}
              className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {formatTimerNumber(entry.name)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("px-2 py-0.5 text-xs rounded-full", getStatusColor(entry.status))}>
                      {getStatusLabel(entry.status)}
                    </span>
                    <DurationDisplay entry={{ ...entry, breaks: entry.breaks || [] }} className="font-mono text-xs text-neutral-600 dark:text-neutral-400" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {entry.status === "RUNNING" && (
                  <button
                    onClick={() => handlePause(entry.id)}
                    disabled={isProcessingEntry}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 disabled:opacity-50 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {entry.status === "PAUSED" && (
                  <button
                    onClick={() => handleResume(entry.id)}
                    disabled={isProcessingEntry}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 transition-colors"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => handleStop(entry.id)}
                  disabled={isProcessingEntry}
                  className="flex-1 px-3 py-1.5 text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );

  const widgetContent = (
    <>
      {/* Floating widget button - hide when expanded in floating mode */}
      {!(timerWidgetPreference === "floating" && isExpanded) && (
        <div
          id="floating-timer-widget"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 transition-all duration-300 z-[99999]"
          style={{
            pointerEvents: "auto",
            margin: 0,
            padding: 0,
          } as React.CSSProperties}
        >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleWidgetClick();
          }}
          type="button"
          className="flex items-center justify-center w-16 h-16 sm:w-18 sm:h-18 bg-primary-600 dark:bg-primary-500 text-white rounded-2xl shadow-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors touch-manipulation"
          style={{ WebkitTapHighlightColor: "transparent" }}
          aria-label={`Active Timers (${activeEntries.length})`}
          data-preference={timerWidgetPreference}
          data-expanded={isExpanded}
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>
      )}

      {/* Dialog mode */}
      {timerWidgetPreference === "dialog" && (
        <Dialog
          open={showDialog}
          onOpenChange={setShowDialog}
          title="Active Timers"
          description={`You have ${activeEntries.length} active timer${activeEntries.length !== 1 ? "s" : ""}`}
        >
          {timerList}
        </Dialog>
      )}

      {/* Floating widget mode */}
      {timerWidgetPreference === "floating" && isExpanded && (
        <>
          {isMobile && (
            <div
              role="presentation"
              className="fixed inset-0 bg-black/20 z-[99998]"
              onClick={() => setIsExpanded(false)}
              style={{ pointerEvents: "auto" }}
            />
          )}
          <div
            className={cn(
              "fixed z-[99999]",
              isMobile
                ? "bottom-2 left-2 right-2"
                : "bottom-6 right-6 w-96"
            )}
            style={{
              pointerEvents: "auto",
              margin: 0,
              padding: 0,
              maxHeight: isMobile ? "85vh" : "auto",
              visibility: "visible",
              opacity: 1,
              display: "block",
              position: "fixed",
              zIndex: 99999,
            } as React.CSSProperties}
            data-debug="floating-widget-expanded"
            data-preference={timerWidgetPreference}
            data-expanded={String(isExpanded)}
            data-mobile={String(isMobile)}
          >
            <div
              className={cn(
                "bg-white dark:bg-neutral-900 rounded-lg shadow-xl border-2 border-primary-500 dark:border-primary-400 overflow-hidden flex flex-col",
                isMobile ? "w-full max-h-[85vh] min-h-[200px]" : "w-full"
              )}
              style={{
                width: "100%",
                minHeight: isMobile ? "200px" : "300px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
              }}
            >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">Active Timers</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-primary-600 dark:bg-primary-500 text-white rounded-full">
                  {activeEntries.length}
                </span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                aria-label="Collapse"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className={cn("overflow-y-auto", isMobile && "flex-1")}>
              {timerList}
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );

  return createPortal(widgetContent, bodyElement);
}
