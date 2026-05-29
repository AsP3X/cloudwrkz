import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { extractDomain, isGitHubUrl } from "@/lib/utils/links";
import { ROUTES } from "@/lib/constants/routes";
import type { Link as LinkType } from "@/lib/types";

// Human: React UI for `LinkInformationSidebar` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS LinkInformationSidebar; REACT component; READS props hooks; MAY CALL api client.
function getLinkTypeColor(type: string) {
  switch (type) {
    case "WEBSITE":
      return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
    case "FILE":
      return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
    case "DOCUMENT":
      return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
    case "VIDEO":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "IMAGE":
      return "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
}

function getLinkTypeLabel(type: string) {
  switch (type) {
    case "WEBSITE":
      return "Website";
    case "FILE":
      return "File";
    case "DOCUMENT":
      return "Document";
    case "VIDEO":
      return "Video";
    case "IMAGE":
      return "Image";
    default:
      return "Other";
  }
}

interface LinkInformationSidebarProps {
  link: LinkType;
  userTimezone: string;
  onViewMetadata: () => void;
  onQueueGithubMetadataRefresh?: () => void;
  githubMetadataRefreshBusy?: boolean;
  githubMetadataRefreshMessage?: string | null;
  onQueueWebsiteMetadataRefresh?: () => void;
  websiteMetadataRefreshBusy?: boolean;
  websiteMetadataRefreshMessage?: string | null;
}

export function LinkInformationSidebar({
  link,
  userTimezone,
  onViewMetadata,
  onQueueGithubMetadataRefresh,
  githubMetadataRefreshBusy,
  githubMetadataRefreshMessage,
  onQueueWebsiteMetadataRefresh,
  websiteMetadataRefreshBusy,
  websiteMetadataRefreshMessage,
}: LinkInformationSidebarProps) {
  const domain = extractDomain(link.url);
  const showGithubRefresh = isGitHubUrl(link.url) && onQueueGithubMetadataRefresh;
  const showWebsiteRefresh = !isGitHubUrl(link.url) && onQueueWebsiteMetadataRefresh;
  const collections = link.collections ?? [];
  const tags = link.tags ?? [];
  const hasMetadata =
    link.metadata && typeof link.metadata === "object" && Object.keys(link.metadata).length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mb-3">
          Link Information
        </h3>

        <div className="mb-4">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
            Type
          </span>
          <Badge className={cn(getLinkTypeColor(link.link_type), "text-sm")}>{getLinkTypeLabel(link.link_type)}</Badge>
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-4" />

        <div className="space-y-2">
          {hasMetadata && (
            <Button variant="outline" size="sm" onClick={onViewMetadata} className="w-full justify-start">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              View Metadata
            </Button>
          )}
          {showGithubRefresh && (
            <>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={githubMetadataRefreshBusy}
                onClick={onQueueGithubMetadataRefresh}
                className="w-full justify-start"
                title="Queues a server job that calls GitHub slowly (about one request per minute) and saves results here."
              >
                <svg className="w-4 h-4 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {githubMetadataRefreshBusy ? "Queuing…" : "Refresh metadata"}
              </Button>
              {githubMetadataRefreshMessage && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-snug">{githubMetadataRefreshMessage}</p>
              )}
            </>
          )}
          {showWebsiteRefresh && (
            <>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={websiteMetadataRefreshBusy}
                onClick={onQueueWebsiteMetadataRefresh}
                className="w-full justify-start"
                title="Re-fetch Open Graph and page metadata from the website (respects robots.txt)."
              >
                <svg className="w-4 h-4 mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {websiteMetadataRefreshBusy ? "Queuing…" : "Refresh website preview"}
              </Button>
              {websiteMetadataRefreshMessage && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-snug">
                  {websiteMetadataRefreshMessage}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
          URL
        </span>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 break-all"
        >
          {link.url}
        </a>
      </div>

      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
          Domain
        </span>
        <p className="text-sm text-neutral-900 dark:text-neutral-100">{domain}</p>
      </div>

      {collections.length > 0 && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
              Collections ({collections.length})
            </span>
            <div className="space-y-2">
              {collections.map((lc) => (
                <Link key={lc.collection.id} to={`${ROUTES.LINKS_COLLECTION}/${lc.collection.id}`} className="block">
                  <Badge
                    className="text-xs w-full justify-start"
                    style={{
                      backgroundColor: lc.collection.color ? `${lc.collection.color}20` : undefined,
                      color: lc.collection.color || undefined,
                      borderColor: lc.collection.color || undefined,
                    }}
                  >
                    {lc.collection.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {tags.length > 0 && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
              Tags ({tags.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />

      <div className="space-y-2">
        <div>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
            Created
          </span>
          <p className="text-sm text-neutral-900 dark:text-neutral-100">
            {formatDateTimeInTimezone(link.created_at, userTimezone)}
          </p>
        </div>
        {link.updated_at &&
          new Date(link.updated_at).getTime() !== new Date(link.created_at).getTime() && (
            <div>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                Last Updated
              </span>
              <p className="text-sm text-neutral-900 dark:text-neutral-100">
                {formatDateTimeInTimezone(link.updated_at, userTimezone)}
              </p>
            </div>
          )}
        {link.metadata_extracted_at && (
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
              Metadata Extracted
            </span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {formatDateTimeInTimezone(link.metadata_extracted_at, userTimezone)}
            </p>
          </div>
        )}
      </div>

      {link.archived_at && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
              Status
            </span>
            <Badge className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-sm">
              Archived
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}
