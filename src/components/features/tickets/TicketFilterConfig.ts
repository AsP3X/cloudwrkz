import { FilterConfig } from "@/components/ui/FilterDialog";

export interface TicketFilterConfigOptions {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  groups?: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  projects?: Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
  }>;
  isAgent: boolean;
}

export const getTicketFilterConfig = (options: TicketFilterConfigOptions): FilterConfig => {
  const { users, groups = [], projects = [], isAgent } = options;

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

  const projectOptions = [
    { value: "", label: "All Projects" },
    ...projects.map((project) => ({
      value: project.id,
      label: `${project.name} (${project.code})`,
    })),
  ];

  const fields: FilterConfig["fields"] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        // "UNRESOLVED" is the default logical filter (OPEN, IN_PROGRESS, PENDING)
        // "ALL" is a special value meaning "no status filter"
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
        { value: "createdAt-asc", label: "Oldest First" },
        { value: "updatedAt-desc", label: "Recently Updated" },
        { value: "updatedAt-asc", label: "Least Recently Updated" },
      ],
      gridCols: 2,
    },
  ];

  // Add agent-only fields
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

    if (projects.length > 0) {
      fields.push({
        key: "projectId",
        label: "Project",
        type: "select",
        options: projectOptions,
        gridCols: 2,
      });
    }
  }

  // Add date fields
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
    }
  );

  return {
    moduleName: "ticket",
    baseRoute: "/dashboard/tickets",
    title: "Filter Tickets",
    description: "Create, edit, and save filter presets to quickly find tickets",
    defaultSort: "createdAt-desc",
    // Default to unresolved tickets so resolved/closed tickets are hidden
    // until the user explicitly changes the status filter.
    defaultFilters: {
      status: "UNRESOLVED",
    },
    fields,
    enablePresets: true,
    enableDateFilters: true,
  };
};
