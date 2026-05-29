import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Link as LinkType } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { YouTubeEmbed } from "@/components/features/links/YouTubeEmbed";
import { GitHubLinkInfo } from "@/components/features/links/GitHubLinkInfo";
import { getLinkDetailHeadlineTitle, isGitHubUrl, isYouTubeUrl } from "@/lib/utils/links";
import {
  getRobotsTxtStatus,
  getWebsitePreviewFields,
  needsWebsitePreviewBackgroundJobs,
  shouldOfferWebsiteMetadataRefresh,
} from "@/lib/utils/linkMetadata";
import { RobotsTxtWarning } from "@/components/features/links/RobotsTxtWarning";
import { WebsiteLinkPreview } from "@/components/features/links/WebsiteLinkPreview";
import {
  LinkDetailLayout,
  LinkDetailSidebarProvider,
} from "@/components/features/links/LinkDetailLayout";
import { LinkInformationSidebar } from "@/components/features/links/LinkInformationSidebar";
import { LinkDetailPageHeader } from "@/components/features/links/LinkDetailPageHeader";
import { EditLinkDialog } from "@/components/features/links/EditLinkDialog/EditLinkDialog";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { Dialog } from "@/components/ui/Dialog";
import { LinkMetadataDisplay } from "@/components/features/links/LinkMetadataDisplay";

// Human: Deep link inspector showing metadata, rich description, optional GitHub enrichment, and edit affordances.
// Agent: GET /links/:id; POLLS github refresh; OPENS EditLinkDialog; REQUIRES modules.links.view; HANDLES 404 state.

export default function LinkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const [link, setLink] = useState<LinkType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [githubRefreshBusy, setGithubRefreshBusy] = useState(false);
  const [githubRefreshMessage, setGithubRefreshMessage] = useState<string | null>(null);
  const githubPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [websiteRefreshBusy, setWebsiteRefreshBusy] = useState(false);
  const [websiteRefreshMessage, setWebsiteRefreshMessage] = useState<string | null>(null);
  const websitePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const websiteAutoQueuedRef = useRef(false);
  const [editLinkDialogOpen, setEditLinkDialogOpen] = useState(false);

  const canViewLinks = can("modules.links.view");
  const canEditBase = can("links.update");
  const canDeleteBase = can("links.delete");

  const loadLink = useCallback(() => {
    if (!id || id === "undefined") {
      setNotFound(true);
      setLink(null);
      return Promise.resolve();
    }
    return api
      .get<{ link: LinkType }>(`/links/${id}`)
      .then((data) => {
        setLink(data.link);
        setNotFound(false);
      })
      .catch(() => {
        setLink(null);
        setNotFound(true);
      });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadLink().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadLink]);

  useEffect(() => {
    setGithubRefreshMessage(null);
    setWebsiteRefreshMessage(null);
    websiteAutoQueuedRef.current = false;
    if (githubPollRef.current) {
      clearInterval(githubPollRef.current);
      githubPollRef.current = null;
    }
    if (websitePollRef.current) {
      clearInterval(websitePollRef.current);
      websitePollRef.current = null;
    }
  }, [id]);

  useEffect(() => {
    return () => {
      if (githubPollRef.current) clearInterval(githubPollRef.current);
      if (websitePollRef.current) clearInterval(websitePollRef.current);
    };
  }, []);

  const queueGithubMetadataRefresh = useCallback(async () => {
    if (!link || !isGitHubUrl(link.url)) return;
    setGithubRefreshBusy(true);
    setGithubRefreshMessage(null);
    try {
      const r = await api.post<{ jobId: string; alreadyQueued: boolean }>(
        `/links/${link.id}/github-metadata/refresh`,
        {},
      );
      setGithubRefreshMessage(
        r.alreadyQueued
          ? "A refresh is already queued or running. This page will update when the server finishes."
          : "Queued. The server calls GitHub slowly (about one request per minute); this page will refresh when new data is saved.",
      );
      if (githubPollRef.current) clearInterval(githubPollRef.current);
      githubPollRef.current = setInterval(() => {
        void loadLink();
      }, 45_000);
    } catch {
      setGithubRefreshMessage("Could not queue a refresh. Try again later.");
    } finally {
      setGithubRefreshBusy(false);
    }
  }, [link, loadLink]);

  const queueWebsiteMetadataRefresh = useCallback(
    async (opts?: { includeMetadata?: boolean; includeScreenshot?: boolean }) => {
    if (!link || isGitHubUrl(link.url)) return;
    setWebsiteRefreshBusy(true);
    setWebsiteRefreshMessage(null);
    try {
      const r = await api.post<{
        jobId?: string | null;
        alreadyQueued?: boolean;
        screenshotJobId?: string | null;
        screenshotAlreadyQueued?: boolean;
      }>(
        `/links/${link.id}/website-metadata/refresh`,
        {
          includeMetadata: opts?.includeMetadata ?? true,
          includeScreenshot: opts?.includeScreenshot ?? true,
        },
      );
      const parts: string[] = [];
      if (r.jobId) {
        parts.push(
          r.alreadyQueued
            ? "Website metadata refresh already queued."
            : "Queued website metadata refresh.",
        );
      }
      if (r.screenshotJobId) {
        parts.push(
          r.screenshotAlreadyQueued
            ? "Screenshot capture already queued."
            : "Queued screenshot capture.",
        );
      }
      setWebsiteRefreshMessage(
        parts.length > 0
          ? `${parts.join(" ")} This page will update when jobs finish.`
          : "Preview refresh queued. This page will update when jobs finish.",
      );
      if (websitePollRef.current) clearInterval(websitePollRef.current);
      websitePollRef.current = setInterval(() => {
        void loadLink();
      }, 20_000);
    } catch {
      setWebsiteRefreshMessage("Could not queue a website preview refresh. Try again later.");
    } finally {
      setWebsiteRefreshBusy(false);
    }
  },
    [link, loadLink],
  );

  useEffect(() => {
    if (!link || !canEditBase || isGitHubUrl(link.url) || isYouTubeUrl(link.url)) return;
    if (!shouldOfferWebsiteMetadataRefresh(link)) return;
    if (websiteAutoQueuedRef.current) return;
    const previewJobs = needsWebsitePreviewBackgroundJobs(link);
    if (!previewJobs) return;
    websiteAutoQueuedRef.current = true;
    void queueWebsiteMetadataRefresh(previewJobs);
  }, [link, canEditBase, queueWebsiteMetadataRefresh]);

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
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          The link you&apos;re looking for doesn&apos;t exist or may have been removed.
        </p>
        <Link to={ROUTES.LINKS}>
          <Button variant="primary">Back to Links</Button>
        </Link>
      </div>
    );
  }

  const isOwner = link.user_id === user?.id;
  const canEdit = canEditBase && isOwner;
  const canDelete = canDeleteBase && isOwner;
  const userTimezone = user?.timezone?.trim() || "UTC";

  const notesText =
    link.notes && link.notes.replace(/<[^>]*>/g, "").trim().length > 0 ? link.notes : null;

  const headlineTitle = getLinkDetailHeadlineTitle({
    title: link.title,
    url: link.url,
    description: link.description,
    metadata: link.metadata,
  });

  const robotsStatus = getRobotsTxtStatus(link.metadata);
  const websitePreview =
    !isGitHubUrl(link.url) && !isYouTubeUrl(link.url)
      ? getWebsitePreviewFields(link.metadata)
      : null;
  const showWebsitePreviewSection =
    websitePreview != null || (!robotsStatus.allowed && !isGitHubUrl(link.url) && !isYouTubeUrl(link.url));

  return (
    <LinkDetailSidebarProvider defaultOpen={true}>
      <LinkDetailPageHeader
        linkId={link.id}
        linkTitle={headlineTitle}
        linkUrl={link.url}
        createdAt={link.created_at}
        favicon={link.favicon}
        isFavorite={link.is_favorite}
        rating={link.rating}
        canEdit={canEdit}
        canDelete={canDelete}
        userTimezone={userTimezone}
        archivedAt={link.archived_at}
        onLinkUpdated={loadLink}
        onEditClick={canEdit ? () => setEditLinkDialogOpen(true) : undefined}
      />

      <EditLinkDialog
        open={editLinkDialogOpen}
        onOpenChange={setEditLinkDialogOpen}
        link={
          editLinkDialogOpen
            ? {
                id: link.id,
                title: link.title,
                url: link.url,
                description: link.description,
                collections: link.collections,
              }
            : null
        }
        onSuccess={() => void loadLink()}
      />

      <LinkDetailLayout
        sidebar={
          <LinkInformationSidebar
            link={link}
            userTimezone={userTimezone}
            onViewMetadata={() => setShowMetadataDialog(true)}
            onQueueGithubMetadataRefresh={queueGithubMetadataRefresh}
            githubMetadataRefreshBusy={githubRefreshBusy}
            githubMetadataRefreshMessage={githubRefreshMessage}
            onQueueWebsiteMetadataRefresh={canEdit ? queueWebsiteMetadataRefresh : undefined}
            websiteMetadataRefreshBusy={websiteRefreshBusy}
            websiteMetadataRefreshMessage={websiteRefreshMessage}
          />
        }
      >
        <div className="space-y-6">
          {!robotsStatus.allowed && robotsStatus.message && (
            <RobotsTxtWarning message={robotsStatus.message} />
          )}

          {showWebsitePreviewSection && websitePreview && (
            <WebsiteLinkPreview preview={websitePreview} pageUrl={link.url} />
          )}
          {showWebsitePreviewSection && !websitePreview && robotsStatus.allowed && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 text-sm text-neutral-600 dark:text-neutral-400">
              Website preview is loading or could not be captured. Use &quot;Refresh website preview&quot; in the
              sidebar to try again.
            </div>
          )}

          {link.description && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
              <div className="w-full break-words">
                <RichTextDisplay content={link.description} />
              </div>
            </div>
          )}

          <YouTubeEmbed url={link.url} />

          {isGitHubUrl(link.url) && <GitHubLinkInfo url={link.url} metadata={link.metadata} />}

          {notesText && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Personal Notes</h2>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
                <RichTextDisplay content={notesText} />
              </div>
            </div>
          )}
        </div>
      </LinkDetailLayout>

      {link.metadata && typeof link.metadata === "object" && Object.keys(link.metadata).length > 0 && (
        <Dialog
          open={showMetadataDialog}
          onOpenChange={setShowMetadataDialog}
          title="Extracted Metadata"
          description="Metadata automatically extracted from the link"
          className="sm:max-w-4xl"
        >
          <div className="p-6">
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-6 max-h-[70vh] overflow-y-auto">
              <LinkMetadataDisplay metadata={link.metadata} />
            </div>
          </div>
        </Dialog>
      )}
    </LinkDetailSidebarProvider>
  );
}
