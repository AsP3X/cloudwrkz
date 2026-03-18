import type { FilterConfig } from "@/components/ui/FilterDialog";

export interface TicketFilterConfigOptions {
  users?: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  groups?: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
  isAgent: boolean;
}

export const getTicketFilterConfig = (options: TicketFilterConfigOptions): FilterConfig => {
  const { users = [], groups = [], isAgent } = options;

  const userOptions = [
    { value: "", label: "All Users" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const groupOptions = [
    { value: "", label: "All Groups" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];

  const fields: FilterConfig["fields"] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "UNRESOLVED", label: "Unresolved (default)" },
        { value: "ALL", label: "All Statuses" },
        { value: "OPEN", label: "Open" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "PENDING", label: "Pending" },
        { value: "RESOLVED", label: "Resolved" },
        { value: "CLOSED", label: "Closed" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
      gridCols: 2,
    },
    {
      key: "sort",
      label: "Sort By",
      type: "select",
      options: [
        { value: "createdAt-desc", label: "Newest First" },
        { value: "createdAt-asc", label: "Oldest First (longest open)" },
        { value: "updatedAt-desc", label: "Recently Updated" },
        { value: "updatedAt-asc", label: "Least Recently Updated" },
        { value: "dueDate-asc", label: "Due Date (soonest first)" },
        { value: "dueDate-desc", label: "Due Date (latest first)" },
      ],
      gridCols: 2,
    },
    {
      key: "overdueOnly",
      label: "Overdue",
      type: "select",
      options: [
        { value: "", label: "All Tickets" },
        { value: "true", label: "Overdue Only (past due date)" },
      ],
      gridCols: 2,
    },
  ];

  if (isAgent) {
    fields.push({
      key: "createdBy",
      label: "Created By",
      type: "select",
      options: userOptions,
      gridCols: 2,
    });

    if (groups.length > 0) {
      fields.push({
        key: "assignedToGroup",
        label: "Assigned To Group",
        type: "select",
        options: groupOptions,
        gridCols: 2,
      });
    }
  }

  fields.push(
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
    {
      key: "dueAfter",
      label: "Due After",
      type: "date",
    },
    {
      key: "dueBefore",
      label: "Due Before",
      type: "date",
    }
  );

  return {
    moduleName: "ticket",
    baseRoute: "/dashboard/tickets",
    title: "Filter Tickets",
    description: "Create, edit, and save filter presets to quickly find tickets",
    defaultSort: "createdAt-desc",
    defaultFilters: {
      status: "UNRESOLVED",
    },
    fields,
    enablePresets: true,
    enableDateFilters: true,
  };
};
