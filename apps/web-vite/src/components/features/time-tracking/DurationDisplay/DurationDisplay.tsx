import React from "react";
import { formatDuration, calculateElapsedTime } from "@/lib/utils/time-tracking";

interface DurationDisplayProps {
  entry: {
    status: string;
    total_duration: number;
    last_resumed_at: string | null;
    started_at: string;
    breaks?: Array<{ started_at: string; ended_at: string | null; duration: number }>;
  };
  className?: string;
}

export function DurationDisplay({ entry, className }: DurationDisplayProps) {
  const [duration, setDuration] = React.useState<number>(entry.total_duration);

  React.useEffect(() => {
    if (entry.status !== "RUNNING") {
      setDuration(calculateElapsedTime(entry));
      return;
    }

    const updateDuration = () => {
      setDuration(calculateElapsedTime(entry));
    };

    updateDuration();

    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [entry]);

  return <span className={className}>{formatDuration(duration)}</span>;
}
