import { useState, useEffect, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Link as LinkType, Collection } from "@/lib/types";
import { LinkViewProvider, useLinkView } from "@/components/features/links/LinkViewContext";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkFilterButton } from "@/components/features/links/LinkFilterButton";
import { LinkFilterLoader } from "@/components/features/links/LinkFilterLoader";
import { LinkList } from "@/components/features/links/LinkList";
import { LinksPagination } from "@/components/features/links/LinksPagination";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

function LinksArchiveContent() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [links, setLinks] = useState<LinkType[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const { viewMode } = useLinkView();

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "25", 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("archived", "true");
      const [linksRes, collectionsRes] = await Promise.allSettled([
        api.get<{ links: LinkType[]; total?: number; totalPages?: number; total_pages?: number }>(`/links?${params.toString()}`),
        api.get<{ collections: Collection[] }>("/collections"),
      ]);
      if (linksRes.status === "fulfilled") {
        setLinks(linksRes.value.links);
        const totalVal = linksRes.value.total ?? linksRes.value.links.length;
        const pagesVal = linksRes.value.totalPages ?? linksRes.value.total_pages ?? 1;
        setTotal(totalVal);
        setTotalPages(pagesVal);
      }
      if (collectionsRes.status === "fulfilled") {
        setCollections(collectionsRes.value.collections);
      }
    } catch {
      setLinks([]);
    }
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LinkFilterLoader isArchivePage={true} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archived Links</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">View and manage archived links</p>
        </div>
        <div className="flex items-center gap-3">
          <LinkViewControls />
          <LinkFilterButton isArchivePage={true} collections={collections} />
          <RouterLink to={ROUTES.LINKS}>
            <Button variant="outline">Back to Links</Button>
          </RouterLink>
        </div>
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} archived link{total !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && <LinksPagination page={page} totalPages={totalPages} />}
        </div>
      )}
      {links.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No archived links</h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">You haven&apos;t archived any links yet.</p>
          <RouterLink to={ROUTES.LINKS}>
            <Button variant="primary">Back to Links</Button>
          </RouterLink>
        </div>
      ) : (
        <LinkList
          links={links as unknown as Parameters<typeof LinkList>[0]["links"]}
          viewMode={viewMode}
          isArchivePage
          currentUserId={user?.id}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}

export default function LinksArchivePage() {
  const { can } = useAuth();

  if (!can("modules.links.view")) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Links module. Please contact an administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "links_archive" }}
            dialogDescription="If you believe you should have access to the Links module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  return (
    <LinkViewProvider>
      <LinksArchiveContent />
    </LinkViewProvider>
  );
}
