import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Link as LinkType } from "@/lib/types";
import { LinkViewProvider, useLinkView } from "@/components/features/links/LinkViewContext";
import { LinkViewControls } from "@/components/features/links/LinkViewControls";
import { LinkList } from "@/components/features/links/LinkList";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { formatDate } from "@/lib/utils/date";

type Collection = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  created_at: string;
  link_count?: number;
  _count?: { links: number };
  links?: LinkType[];
  owner?: { name: string | null; email: string };
};

function CollectionDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const { viewMode } = useLinkView();

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ collection: Collection }>(`/collections/${id}`)
      .then((data) => {
        if (!cancelled) setCollection(data.collection);
      })
      .catch(() => {
        if (!cancelled) setCollection(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Collection not found</h2>
        <Link to={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  const links = collection.links ?? [];
  const linkCount = collection._count?.links ?? collection.link_count ?? links.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Link to={ROUTES.LINKS}>
          <Button variant="outline">← Back to Links</Button>
        </Link>
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <h1
          className="text-2xl font-bold mb-2"
          style={collection.color ? { color: collection.color } : undefined}
        >
          {collection.name}
        </h1>
        {collection.description && (
          <p className="text-neutral-600 dark:text-neutral-400">{collection.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-500 mt-2">
          <span>{linkCount} link{linkCount !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>Created {formatDate(collection.created_at)}</span>
          {collection.owner && (
            <>
              <span>•</span>
              <span>Owner: {collection.owner.name || collection.owner.email}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Links</h2>
        <LinkViewControls />
      </div>
      {links.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No links in this collection</h3>
          <p className="text-neutral-600 dark:text-neutral-400">Add links to this collection from the Links page.</p>
        </div>
      ) : (
        <LinkList
          links={links as unknown as Parameters<typeof LinkList>[0]["links"]}
          viewMode={viewMode}
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}

export default function CollectionDetailPage() {
  const { can } = useAuth();

  if (!can("modules.links.view")) {
    return (
      <AccessDeniedWarning
        message={<>You don&apos;t have permission to access the Links module.</>}
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "links_collections" }}
            dialogDescription="If you believe you should have access to the Links module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.LINKS}
        secondaryLabel="Back to Links"
      />
    );
  }

  return (
    <LinkViewProvider>
      <CollectionDetailContent />
    </LinkViewProvider>
  );
}
