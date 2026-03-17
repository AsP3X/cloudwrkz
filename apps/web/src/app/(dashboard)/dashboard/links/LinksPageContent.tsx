import { getLinks } from "@/server/actions/links";
import type { LinkFilters } from "@/server/actions/links";
import { SHARED_WITH_ME_COLLECTION_ID, LINK_PAGE_SIZE_ALL } from "@/lib/constants/links";
import { LinkListView } from "@/components/features/links/LinkListView";
import { LinksPagination } from "@/components/features/links/LinksPagination";
import { LinksPageSizeSelector } from "@/components/features/links/LinksPageSizeSelector";

interface LinksPageContentProps {
  filters: LinkFilters;
  defaultPageSize: number;
  params: Record<string, string | undefined>;
  limit: number;
  page: number;
  userId: string;
  isSharedWithMeView: boolean;
}

export async function LinksPageContent({
  filters,
  defaultPageSize,
  params,
  limit,
  page,
  userId,
  isSharedWithMeView,
}: LinksPageContentProps) {
  const result = await getLinks(filters);
  const { links, total, totalPages } = result;

  return (
    <div>
      {/* Results Count, page size selector, and pagination */}
      {(total > 0 || page > 1) && (
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} link{total !== 1 ? "s" : ""}
            </span>
            <LinksPageSizeSelector
              currentLimit={limit}
              defaultPageSize={defaultPageSize}
              searchParams={params}
            />
          </div>
          {totalPages > 1 && limit !== LINK_PAGE_SIZE_ALL && (
            <LinksPagination page={page} totalPages={totalPages} searchParams={params} />
          )}
        </div>
      )}

      {/* Links List */}
      {links.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No links yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400">Get started by creating your first link</p>
        </div>
      ) : (
        <LinkListView
          links={links}
          currentUserId={userId}
          isSharedWithMeView={isSharedWithMeView}
        />
      )}

      {/* Same pagination / page size bar at bottom */}
      {(total > 0 || page > 1) && (
        <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} link{total !== 1 ? "s" : ""}
            </span>
            <LinksPageSizeSelector
              currentLimit={limit}
              defaultPageSize={defaultPageSize}
              searchParams={params}
            />
          </div>
          {totalPages > 1 && limit !== LINK_PAGE_SIZE_ALL && (
            <LinksPagination page={page} totalPages={totalPages} searchParams={params} />
          )}
        </div>
      )}
    </div>
  );
}
