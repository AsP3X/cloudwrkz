"use client";

import { FloatingTimerWidget } from "../FloatingTimerWidget";
import { type TimeEntryStatus } from "@prisma/client";

type TimeEntry = {
  id: string;
  name: string;
  status: TimeEntryStatus;
  startedAt: Date;
  totalDuration: number;
  lastResumedAt: Date | null;
};

export function FloatingTimerWidgetWrapper({ activeEntries }: { activeEntries: TimeEntry[] }) {
  return <FloatingTimerWidget activeEntries={activeEntries} />;
}

// Export as renderer for use in page component
export { FloatingTimerWidgetWrapper as FloatingTimerWidgetRenderer };
