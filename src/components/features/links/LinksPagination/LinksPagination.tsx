"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface LinksPaginationProps {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

function buildQuery(params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "page" && value) {
      search.set(key, value);
    }
  });
  if (page > 1) {
    search.set("page", String(page));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

export function LinksPagination({ page, totalPages, searchParams }: LinksPaginationProps) {
  const pathname = usePathname();
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <nav className="flex items-center gap-2" aria-label="Pagination">
      {prevPage ? (
        <Link
          href={`${pathname}${buildQuery(searchParams, prevPage)}`}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          Previous
        </Link>
      ) : (
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed">
          Previous
        </span>
      )}
      <span className="text-sm text-neutral-600 dark:text-neutral-400 px-2">
        Page {page} of {totalPages}
      </span>
      {nextPage ? (
        <Link
          href={`${pathname}${buildQuery(searchParams, nextPage)}`}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          Next
        </Link>
      ) : (
        <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 cursor-not-allowed">
          Next
        </span>
      )}
    </nav>
  );
}
