"use client";

import { usePathname } from "next/navigation";
import { FloatingTimerWidget } from "./FloatingTimerWidget";
import { useActiveTimers } from "@/lib/hooks/useActiveTimers";

interface FloatingTimerWidgetProviderProps {
  timeTrackingEnabled?: boolean;
}

/**
 * Provider component that conditionally renders the floating timer widget
 * on all pages except settings pages
 */
export function FloatingTimerWidgetProvider({ 
  timeTrackingEnabled = true 
}: FloatingTimerWidgetProviderProps) {
  const pathname = usePathname();
  const { activeEntries } = useActiveTimers();

  // Don't show if module is disabled
  if (!timeTrackingEnabled) {
    return null;
  }

  // Don't show on settings pages
  const isSettingsPage = pathname?.startsWith("/dashboard/settings") || 
                         pathname?.startsWith("/dashboard/admin/settings");

  if (isSettingsPage || activeEntries.length === 0) {
    return null;
  }

  return <FloatingTimerWidget activeEntries={activeEntries} />;
}
