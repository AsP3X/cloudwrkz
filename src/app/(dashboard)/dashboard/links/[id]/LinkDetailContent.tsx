"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LinkEditForm } from "@/components/features/links/LinkEditForm";
import { LinkDetailHeader } from "./LinkDetailHeader";
import { LinkDetailLayout } from "./LinkDetailLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { extractDomain, isYouTubeUrl, extractYouTubeVideoId, isGitHubUrl, parseGitHubUrl } from "@/lib/utils/links";
import { LinkMetadataDisplay } from "@/components/features/links/LinkMetadataDisplay";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { Dialog } from "@/components/ui/Dialog";

// Memoized YouTube embed component to prevent reloading when parent re-renders
const YouTubeEmbed = React.memo(({ url }: { url: string }) => {
  if (!isYouTubeUrl(url)) return null;
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  
  return (
    <div 
      className="relative w-full rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg"
      style={{ paddingBottom: "56.25%" }}
    >
      <iframe
        className="absolute top-0 left-0 w-full h-full rounded-xl"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the URL actually changes
  return prevProps.url === nextProps.url;
});

YouTubeEmbed.displayName = "YouTubeEmbed";

const INITIAL_BRANCHES_VISIBLE = 8;

// GitHub repo/file quick links and context for the detail page
const GitHubLinkInfo = React.memo(
  ({ url, metadata }: { url: string; metadata?: any }) => {
  const [showAllBranches, setShowAllBranches] = React.useState(false);
  const parsed = parseGitHubUrl(url);
  if (!parsed) return null;

  const meta = metadata && typeof metadata === "object" ? metadata : null;

  // Profile-only URL (e.g. https://github.com/username)
  if (!parsed.repo) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg">
        <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
          <span className="text-neutral-500 dark:text-neutral-400" aria-hidden>
            <GitHubLogoIcon />
          </span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            GitHub profile
          </span>
          <a
            href={parsed.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-mono"
          >
            {parsed.owner}
          </a>
        </div>
      </div>
    );
  }

  const repoLabel = `${parsed.owner}/${parsed.repo}`;

  const stats = [
    meta?.githubStars != null && {
      key: "stars",
      label: "Stars",
      value: meta.githubStars,
    },
    meta?.githubForks != null && {
      key: "forks",
      label: "Forks",
      value: meta.githubForks,
    },
    meta?.githubCommitsCount != null && {
      key: "commits",
      label: "Commits",
      value: meta.githubCommitsCount,
    },
    meta?.githubBranchesCount != null && {
      key: "branches",
      label: "Branches",
      value: meta.githubBranchesCount,
    },
    meta?.githubReleasesCount != null && {
      key: "releases",
      label: "Releases",
      value: meta.githubReleasesCount,
    },
    meta?.githubOpenIssues != null && {
      key: "issues",
      label: "Open issues",
      value: meta.githubOpenIssues,
    },
  ].filter(Boolean) as { key: string; label: string; value: number }[];

  const branches: string[] = Array.isArray(meta?.githubBranches)
    ? meta.githubBranches.filter(
        (b: unknown): b is string => typeof b === "string" && b.trim().length > 0
      )
    : [];
  const links: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: parsed.repoUrl, label: "Code", icon: <CodeIcon /> },
    { href: `${parsed.repoUrl}/issues`, label: "Issues", icon: <IssueIcon /> },
    { href: `${parsed.repoUrl}/pulls`, label: "Pull requests", icon: <PullIcon /> },
    { href: `${parsed.repoUrl}/actions`, label: "Actions", icon: <ActionIcon /> },
    { href: `${parsed.repoUrl}/releases`, label: "Releases", icon: <ReleaseIcon /> },
    { href: `${parsed.repoUrl}/security`, label: "Security", icon: <SecurityIcon /> },
  ];

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg">
      <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-500 dark:text-neutral-400" aria-hidden>
            <GitHubLogoIcon />
          </span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            GitHub repository
          </span>
          <a
            href={parsed.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-mono break-all"
          >
            {repoLabel}
          </a>
        </div>
        {(parsed.type === "blob" || parsed.type === "tree") && parsed.path && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 truncate" title={parsed.path}>
            {parsed.type === "blob" ? "File" : "Folder"}: {parsed.path}
          </p>
        )}

        {stats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 px-2.5 py-1"
              >
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {stat.label}
                </span>
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 tabular-nums">
                  {new Intl.NumberFormat("en-US").format(stat.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {branches.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1.5">
              Branches
            </p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(showAllBranches ? branches : branches.slice(0, INITIAL_BRANCHES_VISIBLE)).map(
                (branch) => (
                  <a
                    key={branch}
                    href={`${parsed.repoUrl}/tree/${encodeURIComponent(branch)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
                  >
                    {branch}
                  </a>
                )
              )}
              {branches.length > INITIAL_BRANCHES_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAllBranches((prev) => !prev)}
                  className="text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline decoration-dotted underline-offset-1"
                >
                  {showAllBranches
                    ? "Show less"
                    : `+ ${branches.length - INITIAL_BRANCHES_VISIBLE} more`}
                </button>
              )}
              {!showAllBranches &&
                typeof meta?.githubBranchesCount === "number" &&
                meta.githubBranchesCount > branches.length && (
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    ({meta.githubBranchesCount - branches.length} more on GitHub)
                  </span>
                )}
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-3">
          Quick links
        </p>
        <div className="flex flex-wrap gap-2">
          {links.map(({ href, label, icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
            >
              {icon}
              {label}
            </a>
          ))}
        </div>
        {parsed.type === "blob" && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2">
              This link
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm hover:bg-primary-100 dark:hover:bg-primary-900/30"
              >
                View file
              </a>
              {parsed.branch && parsed.path && (
                <a
                  href={url.replace("/blob/", "/raw/")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Raw file
                </a>
              )}
            </div>
          </div>
        )}
        {parsed.type === "tree" && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm hover:bg-primary-100 dark:hover:bg-primary-900/30"
            >
              Browse folder
            </a>
          </div>
        )}
      </div>
    </div>
  );
},
  (prev, next) => prev.url === next.url && prev.metadata === next.metadata
);

GitHubLinkInfo.displayName = "GitHubLinkInfo";

function CodeIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M15.22 4.97a.75.75 0 0 1 1.06 0l6.5 6.5a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 1 1-1.06-1.06l5.97-5.97-5.97-5.97a.75.75 0 0 1 0-1.06Zm-6.44 0a.75.75 0 0 0-1.06 0L2.72 11.47a.75.75 0 0 0 0 1.06l6.5 6.5a.75.75 0 1 0 1.06-1.06L4.81 12l5.97-5.97a.75.75 0 0 0 0-1.06Z" />
    </svg>
  );
}
function IssueIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}
function PullIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M7.177 3.073L9.573.677A.25.25 0 0 1 10 .854v4.792a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.25.25 0 0 0-.25.25v3.5a.25.25 0 0 0 .25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25h-3.5Zm8.25 4a.25.25 0 0 0 .25-.25v-.605l1.975.987a.25.25 0 0 0 .227-.042l1.25-.812a.25.25 0 0 0 .154-.224v-1a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h.5a.25.25 0 0 0 .25-.25v-2.146l1.75-.875v2.646a.25.25 0 0 0 .5 0v-3.5a.25.25 0 0 0-.25-.25h-3.5Z" />
      <path d="M1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h14.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.5 0v3.25h-14v-10h10.75v.75a.25.25 0 0 0 .5 0v-2a.25.25 0 0 0-.25-.25H1.75Z" />
    </svg>
  );
}
function ActionIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M15.146 3.646a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 1 1-.708-.708L17.293 7 15.146 4.854Zm-6.292 0a.5.5 0 0 0-.708 0l-2.5 2.5a.5.5 0 0 0 0 .708l2.5 2.5a.5.5 0 1 0 .708-.708L6.707 7l2.147-2.146Z" />
      <path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8Zm7-6a6 6 0 1 1 0 12A6 6 0 0 1 8 2Zm0 1a5 5 0 1 0 0 10A5 5 0 0 0 8 3Z" />
    </svg>
  );
}
function ReleaseIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M8.75 2.25a.75.75 0 0 1 .75.75v.5h3.5v-.5a.75.75 0 0 1 1.5 0v.5h.5A2.25 2.25 0 0 1 17 4.25v10.5A2.25 2.25 0 0 1 14.75 17H3.25A2.25 2.25 0 0 1 1 14.75V4.25A2.25 2.25 0 0 1 3.25 2h.5v-.5a.75.75 0 0 1 1.5 0v.5h3.5v-.5a.75.75 0 0 1 .75-.75ZM3.25 4a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h11.5a.25.25 0 0 0 .25-.25V4.25a.25.25 0 0 0-.25-.25H3.25Z" />
      <path d="M8 8.75A.75.75 0 0 1 8.75 8h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 8 8.75Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 8 11.75Zm0 3a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 8 14.75Z" />
    </svg>
  );
}
function SecurityIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8Z" />
    </svg>
  );
}
function GitHubLogoIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

interface LinkDetailContentProps {
  link: {
    id: string;
    title: string;
    url: string;
    description: string | null;
    notes: string | null;
    linkType: string;
    tags: string[];
    isFavorite: boolean;
    rating: number | null;
    createdAt: Date;
    updatedAt: Date | null;
    archivedAt: Date | null;
    metadataExtractedAt: Date | null;
    metadata: any;
    collections: Array<{
      collection: {
        id: string;
        name: string;
        color: string | null;
      };
    }>;
    favicon: string | null;
  };
  collections: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  canEdit: boolean;
  canDelete: boolean;
  userTimezone: string;
  currentUserId?: string;
  isOwner?: boolean;
}

export const LinkDetailContent = ({
  link,
  collections,
  canEdit,
  canDelete,
  userTimezone,
  currentUserId,
  isOwner = true,
}: LinkDetailContentProps) => {
  const router = useRouter();
  const [isEditMode, setIsEditMode] = React.useState(false);
  const ratingInputRef = React.useRef<((props: { watch: any; setValue: any }) => React.ReactNode) | null>(null);
  const [formMethods, setFormMethods] = React.useState<{ watch: any; setValue: any } | null>(null);
  const [isRatingInputReady, setIsRatingInputReady] = React.useState(false);
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [showMetadataDialog, setShowMetadataDialog] = React.useState(false);

  const domain = extractDomain(link.url);

  const getLinkTypeColor = (type: string) => {
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
  };

  const getLinkTypeLabel = (type: string) => {
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
  };

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setIsRatingInputReady(false);
  };

  const handleSaveSuccess = () => {
    setIsEditMode(false);
    setIsRatingInputReady(false);
    router.refresh();
  };


  if (isEditMode) {
    return (
      <div className="space-y-6">
        <LinkDetailHeader
          linkId={link.id}
          linkTitle={link.title}
          linkUrl={link.url}
          createdAt={link.createdAt}
          canEdit={canEdit}
          canDelete={canDelete}
          description={link.description}
          favicon={link.favicon}
          isFavorite={isEditMode && formMethods ? formMethods.watch("isFavorite") : link.isFavorite}
          linkType={link.linkType}
          tags={link.tags}
          notes={link.notes}
          rating={link.rating}
          collections={link.collections}
          metadataExtractedAt={link.metadataExtractedAt}
          userTimezone={userTimezone}
          onEditClick={handleEditClick}
          isEditMode={isEditMode}
          archivedAt={link.archivedAt}
          showShare={isOwner}
          showAddToMyCollection={!isOwner}
          showRemoveFromShared={!isOwner}
          onFavoriteToggle={formMethods ? () => {
            const currentValue = formMethods.watch("isFavorite");
            formMethods.setValue("isFavorite", !currentValue, { shouldValidate: true });
            forceUpdate(); // Force re-render to update the star
          } : undefined}
          renderRatingInput={isRatingInputReady && formMethods ? () => {
            if (!ratingInputRef.current || typeof ratingInputRef.current !== 'function') {
              return null;
            }
            try {
              return ratingInputRef.current(formMethods);
            } catch (error) {
              console.error('Error rendering rating input:', error);
              return null;
            }
          } : undefined}
        />
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
          <LinkEditForm
            link={{
              id: link.id,
              url: link.url,
              title: link.title,
              description: link.description,
              favicon: link.favicon,
              linkType: link.linkType,
              tags: link.tags,
              notes: link.notes,
              isFavorite: link.isFavorite,
              rating: link.rating,
              collections: link.collections,
            }}
            collections={collections}
            onCancel={handleCancelEdit}
            onSaveSuccess={handleSaveSuccess}
            onRatingInputReady={(renderFn) => {
              if (typeof renderFn === 'function') {
                ratingInputRef.current = renderFn;
                setIsRatingInputReady(true);
                forceUpdate();
              } else {
                console.error('onRatingInputReady received non-function:', renderFn);
                setIsRatingInputReady(false);
              }
            }}
            onFormMethodsReady={(methods) => {
              setFormMethods(methods);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LinkDetailHeader
        linkId={link.id}
        linkTitle={link.title}
        linkUrl={link.url}
        createdAt={link.createdAt}
        canEdit={canEdit}
        canDelete={canDelete}
        description={link.description}
        favicon={link.favicon}
        isFavorite={link.isFavorite}
        linkType={link.linkType}
        tags={link.tags}
        notes={link.notes}
        rating={link.rating}
        collections={link.collections}
        metadataExtractedAt={link.metadataExtractedAt}
        userTimezone={userTimezone}
        onEditClick={handleEditClick}
        isEditMode={isEditMode}
        archivedAt={link.archivedAt}
        showShare={isOwner}
        showAddToMyCollection={!isOwner}
        showRemoveFromShared={!isOwner}
      />

      <LinkDetailLayout
        sidebar={
          <div className="space-y-4">
            {/* Link Information Section */}
            <div>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mb-3">
                Link Information
              </h3>
              
              {/* Link Type */}
              <div className="mb-4">
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </label>
                <Badge className={cn(getLinkTypeColor(link.linkType), "text-sm")}>
                  {getLinkTypeLabel(link.linkType)}
                </Badge>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 mt-4"></div>

              {/* Metadata Button */}
              {link.metadata && typeof link.metadata === 'object' && Object.keys(link.metadata).length > 0 && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMetadataDialog(true)}
                    className="w-full justify-start"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    View Metadata
                  </Button>
                </div>
              )}
            </div>

            {/* URL */}
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                URL
              </label>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 break-all"
              >
                {link.url}
              </a>
            </div>

            {/* Domain */}
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                Domain
              </label>
              <p className="text-sm text-neutral-900 dark:text-neutral-100">{domain}</p>
            </div>

            {/* Collections */}
            {link.collections.length > 0 && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
                    Collections ({link.collections.length})
                  </label>
                  <div className="space-y-2">
                    {link.collections.map((lc) => (
                      <Link
                        key={lc.collection.id}
                        href={`/dashboard/links?collection=${lc.collection.id}`}
                        className="block"
                      >
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

            {/* Tags */}
            {link.tags.length > 0 && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-2 block">
                    Tags ({link.tags.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {link.tags.map((tag) => (
                      <Badge key={tag} className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

            {/* Timestamps */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created
                </label>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatDateTimeInTimezone(link.createdAt, userTimezone)}
                </p>
              </div>
              {link.updatedAt && link.updatedAt.getTime() !== link.createdAt.getTime() && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Last Updated
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(link.updatedAt, userTimezone)}
                  </p>
                </div>
              )}
              {link.metadataExtractedAt && (
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Metadata Extracted
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(link.metadataExtractedAt, userTimezone)}
                  </p>
                </div>
              )}
            </div>

            {/* Archive Status */}
            {link.archivedAt && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Status
                  </label>
                  <Badge className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-sm">
                    Archived
                  </Badge>
                </div>
              </>
            )}
          </div>
        }
      >
        {/* Main Content */}
        <div className="space-y-6">
          {/* Description */}
          {link.description && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
              <div className="w-full break-words">
                <RichTextDisplay content={link.description} />
              </div>
            </div>
          )}

          {/* YouTube Video Embed */}
          <YouTubeEmbed url={link.url} />

          {/* GitHub repository quick links and context */}
          {isGitHubUrl(link.url) && (
            <GitHubLinkInfo url={link.url} metadata={link.metadata} />
          )}

          {/* Notes - only show if notes exist and are not empty */}
          {link.notes && (() => {
            // Remove HTML tags and check if there's actual content
            const textContent = link.notes.replace(/<[^>]*>/g, '').trim();
            return textContent.length > 0;
          })() && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Personal Notes</h2>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-md p-4">
                <RichTextDisplay content={link.notes} />
              </div>
            </div>
          )}

        </div>
      </LinkDetailLayout>

      {/* Metadata Dialog */}
      {link.metadata && typeof link.metadata === 'object' && Object.keys(link.metadata).length > 0 && (
        <Dialog
          open={showMetadataDialog}
          onOpenChange={setShowMetadataDialog}
          title="Extracted Metadata"
          description="Metadata automatically extracted from the link"
          className="sm:max-w-4xl"
        >
          <div className="p-6">
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-6">
              <LinkMetadataDisplay metadata={link.metadata as any} />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
