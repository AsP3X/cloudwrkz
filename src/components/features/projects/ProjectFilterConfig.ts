import { FilterConfig } from "@/components/ui/FilterDialog";

export const PROJECT_FILTER_CONFIG: FilterConfig = {
  moduleName: "project",
  baseRoute: "/dashboard/projects",
  title: "Filter Projects",
  description: "Filter projects by status, priority, and date ranges",
  defaultSort: "createdAt-desc",
  defaultFilters: {},
  fields: [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "", label: "All Statuses" },
        { value: "PLANNING", label: "Planning" },
        { value: "ACTIVE", label: "Active" },
        { value: "ON_HOLD", label: "On Hold" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
        { value: "ARCHIVED", label: "Archived" },
      ],
      gridCols: 3,
    },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "", label: "All Priorities" },
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" },
        { value: "URGENT", label: "Urgent" },
      ],
      gridCols: 3,
    },
    {
      key: "sort",
      label: "Sort By",
      type: "select",
      options: [
        { value: "createdAt-desc", label: "Newest First" },
        { value: "createdAt-asc", label: "Oldest First" },
        { value: "updatedAt-desc", label: "Recently Updated" },
        { value: "updatedAt-asc", label: "Least Recently Updated" },
        { value: "name-asc", label: "Name (A-Z)" },
        { value: "name-desc", label: "Name (Z-A)" },
      ],
      gridCols: 3,
    },
    {
      key: "createdFrom",
      label: "Created From",
      type: "date",
    },
    {
      key: "createdTo",
      label: "Created To",
      type: "date",
    },
    {
      key: "updatedFrom",
      label: "Last Modified From",
      type: "date",
    },
    {
      key: "updatedTo",
      label: "Last Modified To",
      type: "date",
    },
  ],
  enablePresets: true,
  enableDateFilters: true,
};
