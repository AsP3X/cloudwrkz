import React from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `LinkMetadataDisplay` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS LinkMetadataDisplay; REACT component; READS props hooks; MAY CALL api client.
interface LinkMetadataDisplayProps {
  metadata: Record<string, unknown> | null | undefined;
}

export function LinkMetadataDisplay({ metadata }: LinkMetadataDisplayProps) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const hasAnyMetadata = Object.values(metadata).some((value) => value !== undefined && value !== null);
  if (!hasAnyMetadata) {
    return null;
  }

  const getMetadataLabel = (key: string): string => {
    const labels: Record<string, string> = {
      title: "Title",
      description: "Description",
      image: "Image",
      favicon: "Favicon",
      ogTitle: "Open Graph Title",
      ogDescription: "Open Graph Description",
      ogImage: "Open Graph Image",
      ogType: "Open Graph Type",
      ogUrl: "Open Graph URL",
      ogSiteName: "Site Name",
      twitterTitle: "Twitter Title",
      twitterDescription: "Twitter Description",
      twitterImage: "Twitter Image",
      twitterCard: "Twitter Card Type",
      author: "Author",
      keywords: "Keywords",
      githubOwner: "Owner",
      githubRepo: "Repository",
      githubDefaultBranch: "Default Branch",
      githubStars: "Stars",
      githubForks: "Forks",
      githubWatchers: "Watchers",
      githubOpenIssues: "Open Issues",
      githubIsFork: "Is Fork",
      githubLicense: "License",
      githubPrimaryLanguage: "Primary Language",
      githubTopics: "Topics",
      githubBranches: "Branches",
      githubBranchesCount: "Branch Count",
      githubCommitsCount: "Commit Count",
      githubReleasesCount: "Release Count",
      githubLastPushedAt: "Last Push",
    };
    return labels[key] || key;
  };

  const getCategory = (key: string): string => {
    if (key.startsWith("github")) return "GitHub";
    if (key === "title" || key === "description" || key === "author" || key === "keywords") return "Basic";
    if (key.startsWith("og")) return "Open Graph";
    if (key.startsWith("twitter")) return "Twitter";
    if (key === "image" || key === "favicon") return "Media";
    return "Other";
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Basic":
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "Open Graph":
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        );
      case "Twitter":
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
          </svg>
        );
      case "Media":
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        );
      case "GitHub":
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.371 0 0 5.373 0 12c0 5.303 3.438 9.8 8.207 11.387.6.111.793-.262.793-.579v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.547-1.387-1.334-1.756-1.334-1.756-1.089-.744.083-.729.083-.729 1.205.085 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.335-5.467-5.932 0-1.311.469-2.382 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.839 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.824 1.102.824 2.222v3.293c0 .317.192.69.801.573C20.565 21.796 24 17.298 24 12 24 5.373 18.627 0 12 0Z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        );
    }
  };

  const githubDateFormatter =
    typeof Intl !== "undefined"
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
      : null;

  const formatValue = (key: string, value: unknown): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 dark:text-neutral-500 italic text-sm">Not available</span>;
    }

    if (
      [
        "githubStars",
        "githubForks",
        "githubWatchers",
        "githubOpenIssues",
        "githubBranchesCount",
        "githubCommitsCount",
        "githubReleasesCount",
      ].includes(key) &&
      typeof value === "number"
    ) {
      return (
        <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {value.toLocaleString("en-US")}
        </span>
      );
    }

    if (key === "githubIsFork" && typeof value === "boolean") {
      return (
        <Badge className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs px-2 py-0.5">
          {value ? "Yes" : "No"}
        </Badge>
      );
    }

    if ((key === "githubTopics" || key === "githubBranches") && Array.isArray(value)) {
      const items = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (items.length === 0) {
        return <span className="text-neutral-400 dark:text-neutral-500 italic text-sm">Not available</span>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, idx) => (
            <Badge key={idx} className="text-xs px-2 py-0.5">
              {item}
            </Badge>
          ))}
        </div>
      );
    }

    if (key === "githubLastPushedAt" && typeof value === "string") {
      const date = new Date(value);
      const formatted =
        isNaN(date.getTime()) || !githubDateFormatter ? value : githubDateFormatter.format(date);
      return <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{formatted}</span>;
    }

    if (key.includes("Image") || key.includes("favicon") || key === "ogUrl") {
      const strVal = String(value);
      return (
        <div className="flex items-start gap-3 flex-wrap">
          <a
            href={strVal}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm break-all underline decoration-dotted underline-offset-2 flex-1 min-w-0"
          >
            {strVal}
          </a>
          {(key.includes("Image") || key.includes("favicon")) && (
            <div className="flex-shrink-0">
              <img
                src={strVal}
                alt={key.includes("Image") ? "Preview" : "Favicon"}
                width={key.includes("Image") ? 96 : 24}
                height={key.includes("Image") ? 96 : 24}
                className={cn(
                  "rounded-lg border-2 border-neutral-200 dark:border-neutral-700 shadow-sm",
                  key.includes("Image") ? "w-24 h-24 object-cover" : "w-6 h-6"
                )}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
        </div>
      );
    }

    if (key === "keywords") {
      const keywords =
        typeof value === "string" ? value.split(",").map((k) => k.trim()).filter(Boolean) : [];
      if (keywords.length === 0) {
        return <span className="text-neutral-400 dark:text-neutral-500 italic text-sm">Not available</span>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword, idx) => (
            <Badge key={idx} className="text-xs px-2 py-0.5">
              {keyword}
            </Badge>
          ))}
        </div>
      );
    }

    if (key === "ogType" || key === "twitterCard") {
      return (
        <Badge className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs px-2 py-0.5">
          {String(value)}
        </Badge>
      );
    }

    return <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{String(value)}</span>;
  };

  const entries = Object.entries(metadata)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([keyA], [keyB]) => {
      const categoryOrder: Record<string, number> = {
        Basic: 0,
        GitHub: 1,
        "Open Graph": 2,
        Twitter: 3,
        Media: 4,
        Other: 5,
      };
      const catA = getCategory(keyA);
      const catB = getCategory(keyB);
      if (catA !== catB) {
        return (categoryOrder[catA] || 99) - (categoryOrder[catB] || 99);
      }
      return keyA.localeCompare(keyB);
    });

  if (entries.length === 0) {
    return null;
  }

  const groupedEntries = entries.reduce(
    (acc, [key, value]) => {
      const category = getCategory(key);
      if (!acc[category]) acc[category] = [];
      acc[category].push([key, value]);
      return acc;
    },
    {} as Record<string, Array<[string, unknown]>>
  );

  return (
    <div className="space-y-4">
      {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
        <div
          key={category}
          className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        >
          <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-800/50 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <div className="text-primary-600 dark:text-primary-400">{getCategoryIcon(category)}</div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{category}</h3>
              <Badge className="ml-auto bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs px-2 py-0.5">
                {categoryEntries.length}
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50/50 dark:bg-neutral-800/30">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider w-[200px]">
                    Field
                  </th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {categoryEntries.map(([key, value], idx) => (
                  <tr
                    key={key}
                    className={cn(
                      "transition-colors",
                      idx % 2 === 0 ? "bg-white dark:bg-neutral-900" : "bg-neutral-50/30 dark:bg-neutral-800/20",
                      "hover:bg-primary-50/50 dark:hover:bg-primary-900/10"
                    )}
                  >
                    <td className="py-3 px-4 align-top">
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {getMetadataLabel(key)}
                      </span>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="min-w-0">{formatValue(key, value)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
