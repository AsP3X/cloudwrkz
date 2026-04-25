// Human: Preset ranges for statistics dashboards so API queries and UI labels stay aligned on supported windows.
// Agent: EXPORT readonly STATISTICS_TIMEFRAMES; DERIVES StatisticsTimeframe union; USED BY statistics filters.

export const STATISTICS_TIMEFRAMES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 6 months" },
  { value: "365d", label: "Last 12 months" },
] as const;

export type StatisticsTimeframe = (typeof STATISTICS_TIMEFRAMES)[number]["value"];
