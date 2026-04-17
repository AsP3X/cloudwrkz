import React, { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { parseGitHubUrl } from "@/lib/utils/links";
import { pickGithubMetadataFromRecord } from "@/lib/utils/github-repo-metadata";

const INITIAL_BRANCHES_VISIBLE = 8;

function formatRelative(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

interface GitHubLinkInfoProps {
  url: string;
  metadata?: Record<string, unknown> | null;
}

function GitHubLinkInfoInner({ url, metadata }: GitHubLinkInfoProps) {
  const parsed = parseGitHubUrl(url);
  const [showAllBranches, setShowAllBranches] = useState(false);

  useEffect(() => {
    setShowAllBranches(false);
  }, [url]);

  const meta = useMemo(() => pickGithubMetadataFromRecord(metadata), [metadata]);

  if (!parsed) return null;

  const formatNum = (n: number) => new Intl.NumberFormat("en-US").format(n);

  if (!parsed.repo) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg bg-white dark:bg-neutral-900">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#24292f] dark:bg-neutral-100 text-white dark:text-[#24292f]">
            <GitHubLogoIcon />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              GitHub profile
            </p>
            <a
              href={parsed.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              {parsed.owner}
            </a>
          </div>
          <ExternalLinkIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        </div>
      </div>
    );
  }

  const repoLabel = `${parsed.owner}/${parsed.repo}`;
  const stats = [
    meta.githubStars != null && { key: "stars", label: "Stars", value: meta.githubStars, icon: <StarIcon /> },
    meta.githubForks != null && { key: "forks", label: "Forks", value: meta.githubForks, icon: <ForkIcon /> },
    meta.githubOpenIssues != null && { key: "issues", label: "Issues", value: meta.githubOpenIssues, icon: <IssueIcon /> },
    meta.githubCommitsCount != null && { key: "commits", label: "Commits", value: meta.githubCommitsCount, icon: <CommitIcon /> },
    meta.githubBranchesCount != null && { key: "branches", label: "Branches", value: meta.githubBranchesCount, icon: <BranchIcon /> },
    meta.githubReleasesCount != null && { key: "releases", label: "Releases", value: meta.githubReleasesCount, icon: <ReleaseIcon /> },
  ].filter(Boolean) as { key: string; label: string; value: number; icon: React.ReactNode }[];

  const branches: string[] = Array.isArray(meta.githubBranches)
    ? meta.githubBranches.filter((b) => typeof b === "string" && b.trim().length > 0)
    : [];
  const topics: string[] = Array.isArray(meta.githubTopics)
    ? meta.githubTopics.filter((t): t is string => typeof t === "string").slice(0, 8)
    : [];
  const quickLinks: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: `${parsed.repoUrl}/issues`, label: "Issues", icon: <IssueIcon /> },
    { href: `${parsed.repoUrl}/pulls`, label: "Pull requests", icon: <PullIcon /> },
    { href: `${parsed.repoUrl}/actions`, label: "Actions", icon: <ActionIcon /> },
    { href: `${parsed.repoUrl}/releases`, label: "Releases", icon: <ReleaseIcon /> },
    { href: `${parsed.repoUrl}/security`, label: "Security", icon: <SecurityIcon /> },
  ];

  const metaLine: string[] = [];
  if (meta.githubPrimaryLanguage) metaLine.push(meta.githubPrimaryLanguage);
  if (meta.githubDefaultBranch) metaLine.push(`Default: ${meta.githubDefaultBranch}`);
  if (meta.githubLicense) metaLine.push(meta.githubLicense);
  if (meta.githubLastPushedAt) {
    try {
      const d = new Date(meta.githubLastPushedAt);
      if (!isNaN(d.getTime())) metaLine.push(`Updated ${formatRelative(d)}`);
    } catch {
      // ignore
    }
  }

  const showBranchesBlock = branches.length > 0 || (typeof meta.githubBranchesCount === "number" && meta.githubBranchesCount > 0);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-soft-lg bg-white dark:bg-neutral-900">
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
        <div className="flex items-start gap-4 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#24292f] dark:bg-[#e6edf3] text-white dark:text-[#1f2328] shadow-sm">
            <GitHubLogoIcon />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Repository</p>
            <a
              href={parsed.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-base font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <span className="truncate">{repoLabel}</span>
              <ExternalLinkIcon className="h-4 w-4 shrink-0 opacity-70" />
            </a>
            {(parsed.type === "blob" || parsed.type === "tree") && parsed.path && (
              <p className="mt-1.5 truncate text-xs text-neutral-500 dark:text-neutral-400" title={parsed.path}>
                {parsed.type === "blob" ? "File" : "Folder"} — {parsed.path}
              </p>
            )}
            {metaLine.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{metaLine.join(" · ")}</p>
            )}
          </div>
          <a
            href={parsed.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 self-center inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 shadow-sm transition-colors hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
          >
            Open
            <ExternalLinkIcon className="h-4 w-4 opacity-70" />
          </a>
        </div>

        {stats.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-200 dark:border-neutral-700/80 px-5 py-3 sm:px-6">
            {stats.map(({ key, label, value, icon }) => (
              <div key={key} className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden>
                  {icon}
                </span>
                <span className="tabular-nums font-medium text-neutral-900 dark:text-neutral-100">{formatNum(value)}</span>
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>
        )}

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-neutral-200 dark:border-neutral-700/80 px-5 py-3 sm:px-6">
            {topics.map((topic) => (
              <span
                key={topic}
                className="rounded-md bg-neutral-200/80 dark:bg-neutral-700/80 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {showBranchesBlock && (
          <div className="border-t border-neutral-200 dark:border-neutral-700/80 px-5 py-3 sm:px-6">
            <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Branches</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {(showAllBranches ? branches : branches.slice(0, INITIAL_BRANCHES_VISIBLE)).map((branch) => (
                <a
                  key={branch}
                  href={`${parsed.repoUrl}/tree/${encodeURIComponent(branch)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors"
                >
                  {branch}
                </a>
              ))}
              {branches.length > INITIAL_BRANCHES_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setShowAllBranches((p) => !p)}
                  className="text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {showAllBranches ? "Show less" : `+${branches.length - INITIAL_BRANCHES_VISIBLE} more`}
                </button>
              )}
              {!showAllBranches &&
                typeof meta.githubBranchesCount === "number" &&
                meta.githubBranchesCount > branches.length && (
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    ({meta.githubBranchesCount - branches.length} more on GitHub)
                  </span>
                )}
              {branches.length === 0 && typeof meta.githubBranchesCount === "number" && meta.githubBranchesCount > 0 && (
                <a
                  href={`${parsed.repoUrl}/branches`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  View all {formatNum(meta.githubBranchesCount)} branches on GitHub
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Quick links</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {quickLinks.map(({ href, label, icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 px-3 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 transition-colors hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
            >
              <span className="[&>svg]:h-4 [&>svg]:w-4 text-neutral-500 dark:text-neutral-400">{icon}</span>
              {label}
            </a>
          ))}
        </div>

        {parsed.type === "blob" && (
          <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-200/80 dark:hover:bg-primary-900/50"
            >
              View file
            </a>
            {parsed.branch && parsed.path && (
              <a
                href={url.replace("/blob/", "/raw/")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Raw file
              </a>
            )}
          </div>
        )}
        {parsed.type === "tree" && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 px-3 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-200/80 dark:hover:bg-primary-900/50"
            >
              Browse folder
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export const GitHubLinkInfo = React.memo(
  GitHubLinkInfoInner,
  (prev, next) => prev.url === next.url && prev.metadata === next.metadata
);

GitHubLinkInfo.displayName = "GitHubLinkInfo";

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("w-4 h-4", className)} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L12 11.43l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L3.318 6.045a.75.75 0 0 1 .416-1.28l4.21-.611L11.327.668A.75.75 0 0 1 12 .25Z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0V8A2.25 2.25 0 0 1 19.25 5.75H4.75A2.25 2.25 0 0 1 2.5 8v.372a2.25 2.25 0 1 1 1.5 0ZM3 19.25v-7.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75Zm9-10.5v7.5a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0-.75.75Zm-6.75 7.5a.75.75 0 0 0 .75.75h4.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0-.75.75v7.5Zm15-.75a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v7.5Z" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M15.5 11.75a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" />
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2ZM3.5 12a8.5 8.5 0 0 0 14.998 5.25h-4.5a.75.75 0 0 1 0-1.5h4.5A8.5 8.5 0 0 0 3.5 12Zm9.5 0a.75.75 0 0 1-.75.75H5.75a.75.75 0 0 1 0-1.5h6.5A.75.75 0 0 1 13 12Zm-1.5 0a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 11.5 12Z" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 0 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878Zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm3-8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
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
