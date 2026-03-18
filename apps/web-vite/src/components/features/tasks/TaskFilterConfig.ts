import type { FilterConfig } from "@/components/ui/FilterDialog";

export const getTaskFilterConfig = (): FilterConfig => {
  const fields: FilterConfig["fields"] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ALL", label: "All Statuses" },
        { value: "NOT_STARTED", label: "Not Started" },
        { value: "IN_PROGRESS", label: "In Progress" },
        { value: "BLOCKED", label: "Blocked" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
      ],
      gridCols: 2,
    },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "ALL", label: "All Priorities" },
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" },
        { value: "URGENT", label: "Urgent" },
      ],
      gridCols: 2,
    },
    {
      key: "assignee",
      label: "Assigned To",
      type: "select",
      options: [
        { value: "all", label: "Anyone" },
        { value: "me", label: "Only Me" },
        { value: "unassigned", label: "Unassigned" },
      ],
      gridCols: 2,
    },
    {
      key: "link",
      label: "Linked To Ticket",
      type: "select",
      options: [
        { value: "all", label: "All ToDos" },
        { value: "withTicket", label: "Only ToDos Linked to Tickets" },
        { value: "withoutTicket", label: "Only ToDos Without Ticket" },
      ],
      gridCols: 2,
    },
    {
      key: "kind",
      label: "ToDo Type",
      type: "select",
      options: [
        { value: "all", label: "All ToDos" },
        { value: "root", label: "Only Top-Level ToDos" },
        { value: "subtask", label: "Only Sub-ToDos" },
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
        { value: "dueDate-asc", label: "Closest Due Date" },
        { value: "dueDate-desc", label: "Farthest Due Date" },
      ],
      gridCols: 2,
    },
  ];

  return {
    moduleName: "todo",
    baseRoute: "/dashboard/todos",
    title: "Filter ToDos",
    description: "Create, edit, and save filter presets to quickly find ToDos",
    defaultSort: "createdAt-desc",
    defaultFilters: {
      status: "ALL",
      priority: "ALL",
      assignee: "all",
      link: "all",
      kind: "root",
      sort: "createdAt-desc",
    },
    fields,
    enablePresets: true,
    enableDateFilters: false,
  };
};
