import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getLinks } from "@/server/actions/links";
import { LinkListView } from "@/components/features/links/LinkListView";
import { LinkViewProvider } from "@/components/features/links/LinkViewContext";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkFilterButton } from "@/components/features/links/LinkFilterButton";
import { LinkFilterLoader } from "@/components/features/links/LinkFilterLoader";
import { getCollections } from "@/server/actions/collections";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface LinksArchivePageProps {
  searchParams: Promise<{
    linkType?: string;
    search?: string;
    sort?: string;
  }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LinksArchivePage({ searchParams }: LinksArchivePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const canViewLinks = await canUserViewModule(user.id, MODULE_KEYS.LINKS);

  if (!canViewLinks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          You don&apos;t have permission to access the Links module.
        </p>
      </div>
    );
  }

  // Parse sort parameter
  const sortParam = params.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt" | "title" | "rating", "asc" | "desc"];

  // Build filters - only archived links
  const filters: any = {
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
    archived: true,
  };

  if (params.linkType) {
    filters.linkType = params.linkType;
  }
  if (params.search) {
    filters.search = params.search;
  }

  const links = await getLinks(filters);
  const collections = await getCollections({ archived: false });

  return (
    <LinkViewProvider>
      <div className="space-y-6">
        <LinkFilterLoader collections={collections} />

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archived Links</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">View and manage archived links</p>
          </div>
          <div className="flex items-center gap-3">
            <LinkViewControls />
            <LinkFilterButton collections={collections} />
            <Link href={ROUTES.LINKS}>
              <Button variant="outline">Back to Links</Button>
            </Link>
          </div>
        </div>

        {links.length > 0 && (
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {links.length} archived link{links.length !== 1 ? "s" : ""}
          </div>
        )}

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
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No archived links</h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">You haven&apos;t archived any links yet.</p>
            <Link href={ROUTES.LINKS}>
              <Button variant="primary">Back to Links</Button>
            </Link>
          </div>
        ) : (
          <LinkListView links={links as any} />
        )}
      </div>
    </LinkViewProvider>
  );
}
