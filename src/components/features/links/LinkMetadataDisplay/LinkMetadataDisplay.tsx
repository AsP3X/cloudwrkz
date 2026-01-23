"use client";

import React from "react";
import { LinkMetadata } from "@/lib/utils/link-metadata";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

interface LinkMetadataDisplayProps {
  metadata: LinkMetadata | null | undefined;
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
    };
    return labels[key] || key;
  };

  const getCategory = (key: string): string => {
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
    }
  };

  const formatValue = (key: string, value: any): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 dark:text-neutral-500 italic text-sm">Not available</span>;
    }

    // Handle URLs (images, favicons, URLs)
    if (key.includes("Image") || key.includes("favicon") || key === "ogUrl") {
      return (
        <div className="flex items-start gap-3 flex-wrap">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm break-all underline decoration-dotted underline-offset-2 flex-1 min-w-0"
          >
            {value}
          </a>
          {(key.includes("Image") || key.includes("favicon")) && (
            <div className="flex-shrink-0">
              <img
                src={value}
                alt={key.includes("Image") ? "Preview" : "Favicon"}
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

    // Handle keywords (comma-separated)
    if (key === "keywords") {
      const keywords = typeof value === "string" ? value.split(",").map((k) => k.trim()).filter(Boolean) : [];
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

    // Handle type/card badges
    if (key === "ogType" || key === "twitterCard") {
      return (
        <Badge className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs px-2 py-0.5">
          {value}
        </Badge>
      );
    }

    // Default: plain text
    return <span className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{String(value)}</span>;
  };

  // Get all metadata entries grouped by category
  const entries = Object.entries(metadata)
    .filter(([_, value]) => value !== undefined && value !== null)
    .sort(([keyA], [keyB]) => {
      const categoryOrder: Record<string, number> = {
        Basic: 0,
        "Open Graph": 1,
        Twitter: 2,
        Media: 3,
        Other: 4,
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

  // Group entries by category
  const groupedEntries = entries.reduce((acc, [key, value]) => {
    const category = getCategory(key);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push([key, value]);
    return acc;
  }, {} as Record<string, Array<[string, any]>>);

  return (
    <div className="space-y-4">
      {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
        <div
          key={category}
          className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        >
          {/* Category Header */}
          <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-800/50 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <div className="text-primary-600 dark:text-primary-400">
                {getCategoryIcon(category)}
              </div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {category}
              </h3>
              <Badge className="ml-auto bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs px-2 py-0.5">
                {categoryEntries.length}
              </Badge>
            </div>
          </div>

          {/* Metadata Table */}
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
                      idx % 2 === 0
                        ? "bg-white dark:bg-neutral-900"
                        : "bg-neutral-50/30 dark:bg-neutral-800/20",
                      "hover:bg-primary-50/50 dark:hover:bg-primary-900/10"
                    )}
                  >
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          {getMetadataLabel(key)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="min-w-0">
                        {formatValue(key, value)}
                      </div>
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
