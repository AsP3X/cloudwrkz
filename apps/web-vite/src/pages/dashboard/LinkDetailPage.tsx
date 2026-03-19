import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Link as LinkType } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

export default function LinkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const [link, setLink] = useState<LinkType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const canViewLinks = can("modules.links.view");
  const canEdit = can("links.update") || user?.role === "ADMIN" || user?.role === "AGENT" || user?.role === "MODERATOR";

  useEffect(() => {
    if (!id || id === "undefined") {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ link: LinkType }>(`/links/${id}`)
      .then((data) => {
        if (!cancelled) setLink(data.link);
      })
      .catch(() => {
        if (!cancelled) {
          setLink(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!canViewLinks) {
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
            hiddenFields={{ context: "links_module" }}
            dialogDescription="If you believe you should have access to the Links module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (notFound || !link) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Link not found</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">The link you&apos;re looking for doesn&apos;t exist or may have been removed.</p>
        <Link to={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  const isOwner = link.user_id === user?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={ROUTES.LINKS}>
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Links
          </Button>
        </Link>
        {canEdit && isOwner && (
          <Link to={`${ROUTES.DASHBOARD}/links/${link.id}/edit`}>
            <Button variant="primary" size="sm">
              Edit
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{link.title}</h1>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:underline break-all"
        >
          {link.url}
        </a>
        {link.description && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Description</h2>
            <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{link.description}</p>
          </div>
        )}
        {link.tags && link.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {link.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-2 py-1 rounded-md text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
