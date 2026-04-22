import { Suspense } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";

// Human: React UI for `LinksPagination` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS LinksPagination; REACT component; READS props hooks; MAY CALL api client.
interface LinksPaginationProps {
  page: number;
  totalPages: number;
}

function buildQuery(currentParams: URLSearchParams, page: number): string {
  const search = new URLSearchParams();
  currentParams.forEach((value, key) => {
    if (key !== "page") {
      search.set(key, value);
    }
  });
  if (page > 1) {
    search.set("page", String(page));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

export function LinksPagination(props: LinksPaginationProps) {
  return (
    <Suspense fallback={null}>
      <LinksPaginationInner {...props} />
    </Suspense>
  );
}

function LinksPaginationInner({ page, totalPages }: LinksPaginationProps) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <nav className="flex items-center gap-2" aria-label="Pagination">
      {prevPage ? (
        <Link
          to={`${location.pathname}${buildQuery(searchParams, prevPage)}`}
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
          to={`${location.pathname}${buildQuery(searchParams, nextPage)}`}
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
