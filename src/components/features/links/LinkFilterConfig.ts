import { FilterConfig } from "@/components/ui/FilterDialog";

export interface LinkFilterConfigOptions {
  collections?: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}

export const getLinkFilterConfig = (options: LinkFilterConfigOptions = {}): FilterConfig => {
  const { collections = [] } = options;

  const collectionOptions = [
    { value: "", label: "All Collections" },
    ...collections.map((collection) => ({
      value: collection.id,
      label: collection.name,
    })),
  ];

  const fields: FilterConfig["fields"] = [
    {
      key: "linkType",
      label: "Link Type",
      type: "select",
      options: [
        { value: "", label: "All Types" },
        { value: "WEBSITE", label: "Website" },
        { value: "FILE", label: "File" },
        { value: "DOCUMENT", label: "Document" },
        { value: "VIDEO", label: "Video" },
        { value: "IMAGE", label: "Image" },
        { value: "OTHER", label: "Other" },
      ],
      gridCols: 2,
    },
    {
      key: "isFavorite",
      label: "Favorite",
      type: "select",
      options: [
        { value: "", label: "All" },
        { value: "true", label: "Favorites Only" },
        { value: "false", label: "Non-Favorites" },
      ],
      gridCols: 2,
    },
    {
      key: "minRating",
      label: "Minimum Rating",
      type: "select",
      options: [
        { value: "", label: "Any Rating" },
        { value: "5", label: "5 Stars" },
        { value: "4", label: "4+ Stars" },
        { value: "3", label: "3+ Stars" },
        { value: "2", label: "2+ Stars" },
        { value: "1", label: "1+ Stars" },
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
        { value: "title-asc", label: "Title (A-Z)" },
        { value: "title-desc", label: "Title (Z-A)" },
        { value: "rating-desc", label: "Highest Rated" },
        { value: "rating-asc", label: "Lowest Rated" },
      ],
      gridCols: 2,
    },
  ];

  if (collections.length > 0) {
    fields.splice(1, 0, {
      key: "collection",
      label: "Collection",
      type: "select",
      options: collectionOptions,
      gridCols: 2,
    });
  }

  // Add search field
  fields.push({
    key: "search",
    label: "Search",
    type: "text",
    placeholder: "Search in title, description, URL, notes...",
    gridCols: 2,
  });

  return {
    moduleName: "link",
    baseRoute: "/dashboard/links",
    title: "Filter Links",
    description: "Create, edit, and save filter presets to quickly find links",
    defaultSort: "createdAt-desc",
    defaultFilters: {},
    fields,
    enablePresets: true,
    enableDateFilters: false,
  };
};
