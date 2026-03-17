import { FilterConfig } from "@/components/ui/FilterDialog";

export const TIME_TRACKING_FILTER_CONFIG: FilterConfig = {
  moduleName: "time-tracking",
  baseRoute: "/dashboard/time-tracking",
  title: "Filter Time Entries",
  description: "Filter time entries by status, date ranges, and tags",
  defaultSort: "createdAt-desc", // Not used for time tracking, but required by interface
  defaultFilters: {
    sortBy: "createdAt",
    sortOrder: "desc",
  },
  fields: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "", label: "All Statuses" },
        { value: "RUNNING", label: "Running" },
        { value: "PAUSED", label: "Paused" },
        { value: "STOPPED", label: "Stopped" },
        { value: "COMPLETED", label: "Completed" },
      ],
      gridCols: 2,
    },
    {
      key: "sortBy",
      label: "Sort By",
      type: "select",
      options: [
        { value: "createdAt", label: "Created Date" },
        { value: "startedAt", label: "Started Date" },
        { value: "totalDuration", label: "Duration" },
      ],
      gridCols: 2,
    },
    {
      key: "sortOrder",
      label: "Sort Order",
      type: "select",
      options: [
        { value: "desc", label: "Descending" },
        { value: "asc", label: "Ascending" },
      ],
      gridCols: 2,
    },
    {
      key: "dateFrom",
      label: "Date From",
      type: "date",
    },
    {
      key: "dateTo",
      label: "Date To",
      type: "date",
    },
    {
      key: "tags",
      label: "Tags (comma-separated)",
      type: "text",
      placeholder: "tag1, tag2, tag3",
    },
  ],
  enablePresets: true,
  enableDateFilters: true,
};
