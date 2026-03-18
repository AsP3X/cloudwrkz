import { useState, useEffect, useCallback, useRef } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Link as LinkType, Collection } from "@/lib/types";
import { LinkViewProvider, useLinkView } from "@/components/features/links/LinkViewContext";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkFilterButton } from "@/components/features/links/LinkFilterButton";
import { LinkFilterLoader } from "@/components/features/links/LinkFilterLoader";
import { CollectionFilterBar } from "@/components/features/links/CollectionFilterBar";
import { LinkList } from "@/components/features/links/LinkList";
import { LinksPagination } from "@/components/features/links/LinksPagination";
import { AddLinkDialog } from "@/components/features/links/AddLinkDialog";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

function LinksPageContent() {
  const { user } = useAuth();
  const { viewMode } = useLinkView();
  const [searchParams] = useSearchParams();
  const [links, setLinks] = useState<LinkType[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "25", 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
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
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, searchParams]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LinkFilterLoader />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">My Links</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Save, organize, and discover links
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LinkViewControls />
          <LinkFilterButton collections={collections} />
          <Button variant="primary" onClick={() => setAddDialogOpen(true)}>Create</Button>
          <div className="relative" ref={menuRef}>
            <Button variant="outline" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                <RouterLink to={`${ROUTES.ARCHIVE}?type=links`} className="block w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenuOpen(false)}>
                  Archive
                </RouterLink>
              </div>
            )}
          </div>
        </div>
      </div>

      <CollectionFilterBar
        collections={collections}
        canCreate={true}
        currentUserId={user?.id || ""}
      />

      {total > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} link{total !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && <LinksPagination page={page} totalPages={totalPages} />}
        </div>
      )}

      {links.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No links yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400">Get started by creating your first link</p>
        </div>
      ) : (
        <LinkList
          links={links as unknown as Parameters<typeof LinkList>[0]["links"]}
          viewMode={viewMode}
          currentUserId={user?.id || ""}
          onRefresh={fetchData}
        />
      )}

      {total > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} link{total !== 1 ? "s" : ""}
          </span>
          <LinksPagination page={page} totalPages={totalPages} />
        </div>
      )}

      <AddLinkDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={fetchData}
      />
    </div>
  );
}

export default function LinksPage() {
  const { can } = useAuth();

  if (!can("modules.links.view")) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Links module. Please contact an administrator.
            If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "links_module" }}
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
      <LinksPageContent />
    </LinkViewProvider>
  );
}
