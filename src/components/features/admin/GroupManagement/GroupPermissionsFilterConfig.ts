import { FilterConfig } from "@/components/ui/FilterDialog";

export const getGroupPermissionsFilterConfig = (): FilterConfig => {
  const fields: FilterConfig["fields"] = [
    {
      key: "sort",
      label: "Sort By",
      type: "select",
      options: [
        { value: "name-asc", label: "Name (A-Z)" },
        { value: "name-desc", label: "Name (Z-A)" },
        { value: "members-desc", label: "Most Members" },
        { value: "members-asc", label: "Least Members" },
        { value: "permissions-desc", label: "Most Permissions" },
        { value: "permissions-asc", label: "Least Permissions" },
        { value: "createdAt-desc", label: "Newest First" },
        { value: "createdAt-asc", label: "Oldest First" },
      ],
      gridCols: 2,
    },
    {
      key: "minMembers",
      label: "Min Members",
      type: "text",
      placeholder: "e.g., 5",
      gridCols: 1,
    },
    {
      key: "maxMembers",
      label: "Max Members",
      type: "text",
      placeholder: "e.g., 20",
      gridCols: 1,
    },
    {
      key: "minPermissions",
      label: "Min Permissions",
      type: "text",
      placeholder: "e.g., 10",
      gridCols: 1,
    },
    {
      key: "maxPermissions",
      label: "Max Permissions",
      type: "text",
      placeholder: "e.g., 50",
      gridCols: 1,
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
  ];

  return {
    moduleName: "group-permissions",
    baseRoute: "/dashboard/admin/permissions/groups",
    title: "Filter Groups",
    description: "Create, edit, and save filter presets to quickly find groups",
    defaultSort: "name-asc",
    defaultFilters: {
      sort: "name-asc",
    },
    fields,
    enablePresets: true,
    enableDateFilters: true,
  };
};
