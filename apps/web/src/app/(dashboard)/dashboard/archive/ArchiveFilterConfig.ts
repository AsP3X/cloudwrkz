import { type FilterConfig } from "@/components/ui/FilterDialog";

type ArchiveCanView = { tickets: boolean; todos: boolean; time: boolean; links: boolean };

export const getArchiveFilterConfig = (canView: ArchiveCanView): FilterConfig => {
  const fields: FilterConfig["fields"] = [
    {
      key: "type",
      label: "Item Type",
      type: "select",
      options: [
        { value: "all", label: "All Items" },
        ...(canView.tickets ? [{ value: "tickets", label: "Tickets" }] : []),
        ...(canView.todos ? [{ value: "todos", label: "ToDos" }] : []),
        ...(canView.time ? [{ value: "time", label: "Time entries" }] : []),
        ...(canView.links ? [{ value: "links", label: "Links" }] : []),
      ],
      gridCols: 2,
    },
    {
      key: "sort",
      label: "Sort By",
      type: "select",
      options: [
        { value: "archivedAt-desc", label: "Newest Archived First" },
        { value: "archivedAt-asc", label: "Oldest Archived First" },
        { value: "title-asc", label: "Title (A → Z)" },
        { value: "title-desc", label: "Title (Z → A)" },
      ],
      gridCols: 2,
    },
    {
      key: "archivedFrom",
      label: "Archived From",
      type: "date",
    },
    {
      key: "archivedTo",
      label: "Archived To",
      type: "date",
    },
  ];

  return {
    moduleName: "archive",
    baseRoute: "/dashboard/archive",
    title: "Filter Archive",
    description: "Create, edit, and save filter presets to quickly find archived items",
    defaultSort: "archivedAt-desc",
    defaultFilters: {
      type: "all",
      sort: "archivedAt-desc",
      archivedFrom: "",
      archivedTo: "",
    },
    fields,
    enablePresets: true,
    enableDateFilters: true,
  };
};

