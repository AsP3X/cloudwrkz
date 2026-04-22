// Human: Small dashboard chrome helpers for a friendly greeting header and a long-form “today” date string.
// Agent: getTimeOfDayGreeting READS local hour; formatDashboardDate CALLS toLocaleDateString en-US weekday; NO I/O.

export function getTimeOfDayGreeting(): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatDashboardDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
