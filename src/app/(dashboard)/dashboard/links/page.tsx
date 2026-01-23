import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLinks } from "@/server/actions/links";
import { getCollections } from "@/server/actions/collections";
import { hasPermission } from "@/lib/utils/permissions";
import { LinkViewProvider } from "@/components/features/links/LinkViewContext";
import { LinkFilterLoader } from "@/components/features/links/LinkFilterLoader";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkFilterButton } from "@/components/features/links/LinkFilterButton";
import { LinkListView } from "@/components/features/links/LinkListView";
import { CollectionFilterBarWrapper } from "@/components/features/links/CollectionFilterBar";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LinksPageProvider, CreateButton } from "./LinksPageClient";

interface LinksPageProps {
  searchParams: Promise<{
    collection?: string;
    linkType?: string;
    isFavorite?: string;
    minRating?: string;
    search?: string;
    sort?: string;
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

  // Check if user can view links module (module enabled AND user has permission)
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

  // Parse sort parameter
  const sortParam = params.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt" | "title" | "rating", "asc" | "desc"];

  // Build filters
  const filters: any = {
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
    archived: false, // Don't show archived links by default
  };

  if (params.collection) {
    filters.collectionId = params.collection;
  }
  if (params.linkType) {
    filters.linkType = params.linkType;
  }
  if (params.isFavorite === "true") {
    filters.isFavorite = true;
  } else if (params.isFavorite === "false") {
    filters.isFavorite = false;
  }
  if (params.minRating) {
    filters.minRating = parseInt(params.minRating);
  }
  if (params.search) {
    filters.search = params.search;
  }

  // Get links with filters
  const links = await getLinks(filters);

  // Get collections for filter
  const collections = await getCollections({ archived: false });

  // Check if user can create links
  const canCreateLinks = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "links.create");

  return (
    <LinkViewProvider>
      <LinksPageProvider canCreate={canCreateLinks}>
        <div className="space-y-6">
          {/* Auto-load last used link filters */}
          <LinkFilterLoader collections={collections} />
          
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                My Links
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                Store and organize your bookmarks and links
              </p>
            </div>
            <div className="flex items-center gap-3">
              <LinkViewControls />
              <LinkFilterButton collections={collections} />
              <Link href={ROUTES.LINKS_ARCHIVE}>
                <Button variant="outline">Archive</Button>
              </Link>
              <CreateButton canCreate={canCreateLinks} />
            </div>
          </div>

          {/* Collection Filter Bar */}
          {(canCreateLinks || collections.length > 0) && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4">
              <CollectionFilterBarWrapper collections={collections} canCreate={canCreateLinks} />
            </div>
          )}

          {/* Main Content */}
          <div>
            {/* Results Count */}
            {links.length > 0 && (
              <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Showing {links.length} link{links.length !== 1 ? "s" : ""}
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
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">Get started by creating your first link</p>
                <CreateButton canCreate={canCreateLinks} />
              </div>
            ) : (
              <LinkListView links={links} />
            )}
          </div>
        </div>
      </LinksPageProvider>
    </LinkViewProvider>
  );
}
