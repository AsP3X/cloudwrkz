"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  LINK_PAGE_SIZE_OPTIONS,
  LINK_PAGE_SIZE_ALL,
} from "@/lib/constants/links";

interface LinksPageSizeSelectorProps {
  currentLimit: number;
  defaultPageSize: number; // reserved for future use, e.g. "(default)" label
  searchParams: Record<string, string | undefined>;
}

function buildQueryWithLimit(
  params: Record<string, string | undefined>,
  limit: number | "all"
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key === "page" || key === "limit") return;
    if (value) search.set(key, value);
  });
  search.set("limit", limit === "all" ? "all" : String(limit));
  search.set("page", "1");
  const q = search.toString();
  return q ? `?${q}` : "?limit=" + (limit === "all" ? "all" : String(limit)) + "&page=1";
}

export function LinksPageSizeSelector({
  currentLimit,
  defaultPageSize,
  searchParams,
}: LinksPageSizeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const limit = value === "all" ? "all" : parseInt(value, 10);
    const query = buildQueryWithLimit(searchParams, limit);
    router.push(`${pathname}${query}`);
  };

  const displayValue =
    currentLimit === LINK_PAGE_SIZE_ALL ? "all" : String(currentLimit);

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
      <span>Per page</span>
      <select
        value={displayValue}
        onChange={handleChange}
        className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label="Links per page"
      >
        {LINK_PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="all">All</option>
      </select>
    </label>
  );
}
