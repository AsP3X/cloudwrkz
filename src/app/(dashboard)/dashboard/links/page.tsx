import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getSharedWithMeCount, type LinkType } from "@/server/actions/links";
import { getLinksDefaultPageSize } from "@/server/actions/admin/settings";
import {
  SHARED_WITH_ME_COLLECTION_ID,
  LINK_PAGE_SIZE_OPTIONS,
  LINK_PAGE_SIZE_ALL,
} from "@/lib/constants/links";
import { getCollections } from "@/server/actions/collections";
import { hasPermission } from "@/lib/utils/permissions";
import { LinkViewProvider } from "@/components/features/links/LinkViewContext";
import { LinkFilterLoader } from "@/components/features/links/LinkFilterLoader";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkFilterButton } from "@/components/features/links/LinkFilterButton";
import { CollectionFilterBarWrapper } from "@/components/features/links/CollectionFilterBar";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LinksPageProvider, CreateButton, LinksOverviewActionsMenu } from "./LinksPageClient";
import { Suspense } from "react";
import { LinksListLoader } from "./LinksListLoader";
import { LinksPageContent } from "./LinksPageContent";

interface LinksPageProps {
  searchParams: Promise<{
    collection?: string;
    linkType?: string;
    isFavorite?: string;
    minRating?: string;
    search?: string;
    sort?: string;
    page?: string;
    limit?: string;
  }>;
}

// Force dynamic rendering to prevent caching issues with permissions
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LinksPage({ searchParams }: LinksPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Parse sort parameter
  const sortParam = params.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt" | "title" | "rating", "asc" | "desc"];

  // Check module access first so we don't call link/collection actions for users without permission
  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);
  if (!canViewLinks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          You don&apos;t have permission to access the Links module. Please contact an administrator.
        </p>
      </div>
    );
  }

  // Only fetch link-related data for users who can view the module
  const [defaultPageSize, collections, sharedWithMeCount] = await Promise.all([
    getLinksDefaultPageSize(),
    getCollections({ archived: false }),
    getSharedWithMeCount(),
  ]);

  const validLimits = [...LINK_PAGE_SIZE_OPTIONS, LINK_PAGE_SIZE_ALL];
  const limitParam = params.limit;
  const limit =
    limitParam === "all"
      ? LINK_PAGE_SIZE_ALL
      : limitParam
        ? (() => {
            const n = parseInt(limitParam, 10);
            return validLimits.includes(n) ? n : defaultPageSize;
          })()
        : defaultPageSize;

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const filters = {
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
    archived: false as const,
    page,
    limit,
    ...(params.collection && { collectionId: params.collection }),
    ...(params.linkType && { linkType: params.linkType as LinkType }),
    ...(params.isFavorite === "true" && { isFavorite: true }),
    ...(params.isFavorite === "false" && { isFavorite: false }),
    ...(params.minRating && { minRating: parseInt(params.minRating, 10) }),
    ...(params.search && { search: params.search }),
  };

  const collectionsForSidebar =
    sharedWithMeCount > 0
      ? [
          {
            id: SHARED_WITH_ME_COLLECTION_ID,
            name: "Shared with me",
            description: null as string | null,
            color: null as string | null,
            _count: { links: sharedWithMeCount },
          },
          ...collections,
        ]
      : collections;

  // Check if user can create links
  const canCreateLinks = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "links.create");

  return (
    <LinkViewProvider>
      <LinksPageProvider canCreate={canCreateLinks} collections={collectionsForSidebar}>
        <div className="space-y-6">
          {/* Auto-load last used link filters */}
          <LinkFilterLoader collections={collectionsForSidebar} />
          
          {/* Header: title and subtitle on top (centered); actions row always below, full width */}
          <div className="flex flex-col gap-4">
            <div className="flex min-w-0 w-full flex-col items-center justify-center text-center">
              <svg
                className="w-10 h-10 text-primary-600 dark:text-primary-400 shrink-0 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                {params.collection === SHARED_WITH_ME_COLLECTION_ID ? "Shared with me" : "My Links"}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                Store and organize your bookmarks and links
              </p>
            </div>
            <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-2 md:gap-3">
              <div className="flex items-center shrink-0">
                <LinkViewControls />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden md:flex items-center gap-2">
                  <LinkFilterButton collections={collections} />
                  <Link href={ROUTES.LINKS_ARCHIVE}>
                    <Button variant="outline" size="sm" className="shrink-0">
                      Archive
                    </Button>
                  </Link>
                </div>
                <CreateButton canCreate={canCreateLinks} />
                <LinksOverviewActionsMenu
                  canCreate={canCreateLinks}
                  collectionId={params.collection}
                  collections={collectionsForSidebar}
                />
              </div>
            </div>
          </div>

          {/* Collection Filter Bar */}
          {(canCreateLinks || collectionsForSidebar.length > 0) && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4">
              <CollectionFilterBarWrapper collections={collectionsForSidebar} canCreate={canCreateLinks} currentUserId={user.id} />
            </div>
          )}

          {/* Main Content: loader until links are loaded, then list + pagination */}
          <Suspense fallback={<LinksListLoader />}>
            <LinksPageContent
              filters={filters}
              defaultPageSize={defaultPageSize}
              params={params}
              limit={limit}
              page={page}
              userId={user.id}
              isSharedWithMeView={params.collection === SHARED_WITH_ME_COLLECTION_ID}
            />
          </Suspense>
        </div>
      </LinksPageProvider>
    </LinkViewProvider>
  );
}
