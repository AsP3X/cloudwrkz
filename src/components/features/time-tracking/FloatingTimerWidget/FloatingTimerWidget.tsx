"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DurationDisplay } from "../DurationDisplay";
import { getStatusColor, getStatusLabel } from "@/lib/utils/time-tracking";
import { pauseTimeEntry, resumeTimeEntry, stopTimeEntry } from "@/server/actions/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";
import { cn } from "@/lib/utils/cn";

type TimeEntry = {
  id: string;
  name: string;
  status: TimeEntryStatus;
  startedAt: Date;
  totalDuration: number;
  lastResumedAt: Date | null;
};

interface FloatingTimerWidgetProps {
  activeEntries: TimeEntry[];
}

export function FloatingTimerWidget({ activeEntries }: FloatingTimerWidgetProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [processing, setProcessing] = React.useState<Set<string>>(new Set());
  const [mounted, setMounted] = React.useState(false);
  const [bodyElement, setBodyElement] = React.useState<HTMLElement | null>(null);

  // Only render on client side and get body element
  React.useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && document.body) {
      setBodyElement(document.body);
    }
  }, []);

  // Create handler functions that directly call server actions to avoid serialization issues
  // Wrapping server actions in arrow functions causes hash mismatches in production builds
  // IMPORTANT: All hooks must be called before any early returns to follow Rules of Hooks
  const handlePause = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      const result = await pauseTimeEntry(entryId);
      if (result.success) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [router]);

  const handleResume = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      const result = await resumeTimeEntry(entryId);
      if (result.success) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [router]);

  const handleStop = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      const result = await stopTimeEntry(entryId);
      if (result.success) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [router]);

  // Don't render anything during SSR or if no active entries or body not ready
  // This must come AFTER all hooks are called
  if (!mounted || activeEntries.length === 0 || !bodyElement) {
    return null;
  }

  const widgetContent = (
    <div
      id="floating-timer-widget"
      className={cn(
        "transition-all duration-300",
        isExpanded ? "w-80" : "w-auto"
      )}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 99999,
        pointerEvents: "auto",
        margin: 0,
        padding: 0,
        left: "auto",
        top: "auto",
      } as React.CSSProperties}
    >
      {!isExpanded ? (
        // Collapsed state - show badge with count
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 px-4 py-3 bg-primary-600 dark:bg-primary-500 text-white rounded-lg shadow-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">Active Timers ({activeEntries.length})</span>
        </button>
      ) : (
        // Expanded state - show list of timers
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
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

          {/* Timer List */}
          <div className="max-h-96 overflow-y-auto">
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
                        {entry.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("px-2 py-0.5 text-xs rounded-full", getStatusColor(entry.status))}>
                          {getStatusLabel(entry.status)}
                        </span>
                        <DurationDisplay entry={entry} className="font-mono text-xs text-neutral-600 dark:text-neutral-400" />
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
        </div>
      )}
    </div>
  );

  // Render to document body using portal to ensure it's always fixed relative to viewport
  return createPortal(widgetContent, bodyElement);
}
