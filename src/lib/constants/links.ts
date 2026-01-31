/** Virtual collection id for "Shared with me" - links shared directly with the current user */
export const SHARED_WITH_ME_COLLECTION_ID = "__shared_with_me__";

/** Page size options for the links overview (10, 25, 50, 100, all). 50 is the default. */
export const LINK_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
/** Value used for "show all" (single page with all links, capped for safety). */
export const LINK_PAGE_SIZE_ALL = 10000;
export const DEFAULT_LINKS_PAGE_SIZE = 50;

export type LinkPageSizeOption = (typeof LINK_PAGE_SIZE_OPTIONS)[number] | typeof LINK_PAGE_SIZE_ALL;

/** Valid values for links overview default page size (10, 25, 50, 100, or "all" = 10000). */
export const LINKS_DEFAULT_PAGE_SIZE_VALUES = [
  ...LINK_PAGE_SIZE_OPTIONS,
  LINK_PAGE_SIZE_ALL,
] as const;
