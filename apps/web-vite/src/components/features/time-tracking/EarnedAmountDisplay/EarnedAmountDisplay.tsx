import React from "react";
import type { TimeEntry } from "@/lib/types";
import { calculateEarnedAmount, formatCurrencyAmount } from "@/lib/utils/time-tracking";

// Human: Live-updating earned amount from worked seconds times the entry's snapshot hourly rate.
// Agent: READS TimeEntry billable hourly_rate; CALLS calculateEarnedAmount; TICK 1s when RUNNING/PAUSED; RETURNS null when billing hidden or amount zero.

interface EarnedAmountDisplayProps {
  entry: TimeEntry;
  className?: string;
}

export function EarnedAmountDisplay({ entry, className }: EarnedAmountDisplayProps) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (entry.status !== "RUNNING" && entry.status !== "PAUSED") return;
    const interval = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(interval);
  }, [entry.status]);

  const amount = calculateEarnedAmount(entry);
  if (amount == null) return null;

  return (
    <span className={className}>
      {formatCurrencyAmount(amount)}
    </span>
  );
}
