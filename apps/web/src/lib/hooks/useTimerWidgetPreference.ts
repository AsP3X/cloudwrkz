"use client";

import { useState, useEffect } from "react";

export type TimerWidgetMobileMode = "dialog" | "floating";

const TIMER_WIDGET_PREFERENCE_KEY = "timer-widget-mobile-mode";

/**
 * Get the initial timer widget preference from localStorage
 */
export function getTimerWidgetPreference(): TimerWidgetMobileMode {
  if (typeof window === "undefined") return "dialog";
  
  try {
    const stored = localStorage.getItem(TIMER_WIDGET_PREFERENCE_KEY);
    if (stored && (stored === "dialog" || stored === "floating")) {
      return stored as TimerWidgetMobileMode;
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  
  return "dialog"; // Default to dialog
}

/**
 * Save timer widget preference to localStorage
 */
export function saveTimerWidgetPreference(mode: TimerWidgetMobileMode): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(TIMER_WIDGET_PREFERENCE_KEY, mode);
  } catch (error) {
    // Ignore localStorage errors
  }
}

// Custom event name for preference changes
const PREFERENCE_CHANGE_EVENT = "timer-widget-preference-change";

/**
 * Hook to manage timer widget preference
 */
export function useTimerWidgetPreference() {
  const [preference, setPreferenceState] = useState<TimerWidgetMobileMode>(() => {
    const initial = getTimerWidgetPreference();
    return initial;
  });

  // Listen for storage changes to sync across tabs and same-tab changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TIMER_WIDGET_PREFERENCE_KEY && e.newValue) {
        if (e.newValue === "dialog" || e.newValue === "floating") {
          setPreferenceState(e.newValue as TimerWidgetMobileMode);
        }
      }
    };

    // Listen for custom events (same tab changes)
    const handlePreferenceChange = () => {
      const currentPreference = getTimerWidgetPreference();
      setPreferenceState((prev) => {
        if (prev !== currentPreference) {
          return currentPreference;
        }
        return prev;
      });
    };

    // Also poll localStorage periodically to catch changes (fallback)
    const interval = setInterval(() => {
      const currentPreference = getTimerWidgetPreference();
      setPreferenceState((prev) => {
        if (prev !== currentPreference) {
          return currentPreference;
        }
        return prev;
      });
    }, 500); // Check every 500ms

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(PREFERENCE_CHANGE_EVENT, handlePreferenceChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(PREFERENCE_CHANGE_EVENT, handlePreferenceChange);
    };
  }, []);

  const setPreference = (mode: TimerWidgetMobileMode) => {
    setPreferenceState(mode);
    saveTimerWidgetPreference(mode);
    // Dispatch custom event to notify other components in the same tab
    window.dispatchEvent(new CustomEvent(PREFERENCE_CHANGE_EVENT));
  };

  return {
    preference,
    setPreference,
  };
}
