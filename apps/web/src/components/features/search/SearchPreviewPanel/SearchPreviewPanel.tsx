"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import type { SearchResult } from "@/server/actions/search";
import { cn } from "@/lib/utils/cn";

interface SearchPreviewPanelProps {
  result: SearchResult | null;
  onNavigate: () => void;
}

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  PENDING: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  CLOSED: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  NOT_STARTED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  BLOCKED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

// Safely get a string value from unknown metadata field
function str(v: unknown): string {
  return v != null ? String(v) : "";
}

export function SearchPreviewPanel({ result, onNavigate }: SearchPreviewPanelProps) {
  const [faviconFailed, setFaviconFailed] = React.useState(false);

  React.useEffect(() => {
    setFaviconFailed(false);
  }, [result?.id]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-neutral-400 dark:text-neutral-600">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm font-medium">Select a result to preview</p>
        <p className="text-xs mt-1 opacity-60">Use arrow keys to navigate</p>
      </div>
    );
  }

  const meta = (result.metadata ?? {}) as Record<string, unknown>;
  const faviconUrl = str(meta.favicon);
  const ticketNumber = str(meta.ticketNumber);
  const taskNumber = str(meta.taskNumber);
  const status = str(meta.status);
  const priority = str(meta.priority);
  const ticketType = str(meta.type);
  const role = str(meta.role);
  const email = str(meta.email);
  const linkedTicketNumber = str(meta.ticketNumber);
  const linkUrl = str(meta.url);
  const rating = meta.rating != null ? str(meta.rating) : null;
  const tags = Array.isArray(meta.tags) ? (meta.tags as unknown[]).map(str) : [];
  const isArchived = !!meta.archivedAt;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 p-5 space-y-4">
        {/* Title row */}
        <div className="flex items-start gap-3">
          {result.type === "link" && faviconUrl && !faviconFailed ? (
            <Image
              src={faviconUrl}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 rounded object-contain flex-shrink-0 mt-0.5"
              unoptimized
              onError={() => setFaviconFailed(true)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
              {result.title}
            </h3>
            {result.type === "ticket" && ticketNumber && (
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-0.5 block">
                {ticketNumber}
              </span>
            )}
            {result.type === "task" && taskNumber && (
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-0.5 block">
                {taskNumber}
              </span>
            )}
          </div>
        </div>

        {/* Badges */}
        {(result.type === "ticket" || result.type === "task") && (status || priority || ticketType || isArchived) && (
          <div className="flex flex-wrap gap-1.5">
            {status && (
              <Badge label={status} className={statusColors[status] ?? statusColors.OPEN} />
            )}
            {priority && (
              <Badge label={priority} className={priorityColors[priority] ?? priorityColors.MEDIUM} />
            )}
            {result.type === "ticket" && ticketType && (
              <Badge label={ticketType} className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" />
            )}
            {isArchived && (
              <Badge label="Archived" className="bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" />
            )}
          </div>
        )}

        {result.type === "user" && role && (
          <div className="flex flex-wrap gap-1.5">
            <Badge label={role} className="bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300" />
          </div>
        )}

        {result.type === "timeentry" && (status || linkedTicketNumber) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {status && (
              <Badge label={status} className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" />
            )}
            {linkedTicketNumber && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Ticket: {linkedTicketNumber}
              </span>
            )}
          </div>
        )}

        {/* Description / context */}
        {(result.description || result.context) && (
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 p-3 border border-neutral-200 dark:border-neutral-700">
            <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-6 leading-relaxed whitespace-pre-wrap">
              {result.context || result.description}
            </p>
          </div>
        )}

        {/* Link URL */}
        {result.type === "link" && linkUrl && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">URL: </span>
            {linkUrl}
          </div>
        )}

        {/* Link tags & rating */}
        {result.type === "link" && (rating !== null || tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {rating !== null && (
              <span className="flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {rating}
              </span>
            )}
            {tags.slice(0, 5).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* User email */}
        {result.type === "user" && email && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {email}
          </p>
        )}
      </div>

      {/* Footer action */}
      <div className="flex-shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-800">
        <Link
          href={result.url}
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-sm font-semibold transition-colors"
        >
          Open
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
