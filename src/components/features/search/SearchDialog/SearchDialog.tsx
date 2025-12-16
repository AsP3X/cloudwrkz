"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/server/actions/search";
import { callServerActionWithRetry } from "@/lib/utils/server-action-utils";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [totalResults, setTotalResults] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Ensure component is mounted before rendering portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Debounce search with minimum query length
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Dynamically import to avoid stale server action references
        const response = await callServerActionWithRetry(async () => {
          const { globalSearch } = await import("@/server/actions/search");
          return await globalSearch(query, 20);
        }, 1); // Only 1 retry to reduce failed requests
        
        setResults(response.results);
        setTotalResults(response.total);
        setSelectedIndex(-1);
      } catch (error: any) {
        console.error("Search error:", error);
        // Don't show error to user, just clear results
        // Stale action errors are handled by retry logic
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
      setQuery("");
      setResults([]);
      return;
    }

    if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleResultClick(results[selectedIndex]);
      return;
    }

    if (e.key === "Enter" && query.trim() && query.trim().length >= 2) {
      e.preventDefault();
      router.push(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
      onOpenChange(false);
      setQuery("");
      setResults([]);
      return;
    }

    if (results.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    router.push(result.url);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  const toggleTicketExpansion = (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTickets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId);
      } else {
        newSet.add(ticketId);
      }
      return newSet;
    });
  };

  // Group results by ticket
  const groupedResults = React.useMemo(() => {
    const groups: Array<{ ticket: SearchResult; comments: SearchResult[] }> = [];
    const ticketMap = new Map<string, SearchResult>();
    const commentMap = new Map<string, SearchResult[]>();

    results.forEach((result) => {
      if (result.type === "ticket") {
        ticketMap.set(result.id, result);
        if (!commentMap.has(result.id)) {
          commentMap.set(result.id, []);
        }
      } else if (result.type === "comment" && result.parentTicketId) {
        const comments = commentMap.get(result.parentTicketId) || [];
        comments.push(result);
        commentMap.set(result.parentTicketId, comments);
      } else {
        // User or other types - add as standalone
        groups.push({ ticket: result, comments: [] });
      }
    });

    // Add tickets with their comments
    ticketMap.forEach((ticket) => {
      groups.push({
        ticket,
        comments: commentMap.get(ticket.id) || [],
      });
    });

    return groups;
  }, [results]);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setTotalResults(0);
    inputRef.current?.focus();
  };

  const highlightMatch = (text: string, searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return text;

    // Support multi-term queries by highlighting each word independently.
    const terms = searchTerm
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (terms.length === 0) return text;

    const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) => {
      const isMatch = terms.some((term) => part.toLowerCase() === term.toLowerCase());
      if (isMatch) {
        return (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded px-0.5"
          >
            {part}
          </mark>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  const getResultIcon = (type: SearchResult["type"]) => {
    if (type === "ticket") {
      return (
        <svg
          className="w-5 h-5 text-primary-600 dark:text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    }
    if (type === "user") {
      return (
        <svg
          className="w-5 h-5 text-green-600 dark:text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      );
    }
    if (type === "comment") {
      return (
        <svg
          className="w-4 h-4 text-neutral-400 dark:text-neutral-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    }
    if (type === "timeentry") {
      return (
        <svg
          className="w-5 h-5 text-purple-600 dark:text-purple-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    }
    if (type === "project") {
      return (
        <svg
          className="w-5 h-5 text-blue-600 dark:text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      );
    }
    if (type === "setting") {
      return (
        <svg
          className="w-5 h-5 text-amber-600 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
    }
    return null;
  };

  const formatTicketStatus = (status: string) => {
    const statusColors: Record<string, string> = {
      OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      PENDING: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      CLOSED: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
      CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return statusColors[status] || statusColors.OPEN;
  };

  if (!open || !mounted) return null;

  const dialogContent = (
    <>
      {/* Backdrop - blurred - covers entire page */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-md z-[100] animate-fade-in"
        onClick={() => {
          onOpenChange(false);
          setQuery("");
          setResults([]);
        }}
      />
      
      {/* Dialog */}
      <div
        className="fixed inset-0 z-[101] flex items-start justify-center pt-20 px-4 pointer-events-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onOpenChange(false);
            setQuery("");
            setResults([]);
          }
        }}
      >
        <div
          className={cn(
            "bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800",
            "w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col",
            "animate-slide-in pointer-events-auto"
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          {/* Search Input */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {isLoading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-primary-600 dark:text-primary-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search tickets, users, time entries, projects, settings..."
                className={cn(
                  "w-full pl-10 pr-10 py-3 rounded-lg border-2 transition-all duration-200",
                  "bg-white text-neutral-900 border-neutral-200",
                  "dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800",
                  "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                  "focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400"
                )}
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                  aria-label="Clear search"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                Type at least 2 characters to search
              </p>
            )}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="flex-1 overflow-y-auto">
            {query.trim().length >= 2 && (
              <>
                {isLoading ? (
                  <div className="p-8 text-center">
                    <svg
                      className="animate-spin h-8 w-8 text-primary-600 dark:text-primary-400 mx-auto mb-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Searching...</p>
                  </div>
                ) : results.length > 0 ? (
                  <>
                    {/* Results Header */}
                    <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/50">
                      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        {totalResults} result{totalResults !== 1 ? "s" : ""} found
                      </p>
                      {query.trim() && (
                        <Link
                          href={`/dashboard/search?q=${encodeURIComponent(query.trim())}`}
                          onClick={() => {
                            onOpenChange(false);
                            setQuery("");
                            setResults([]);
                          }}
                          className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                        >
                          View all results →
                        </Link>
                      )}
                    </div>

                    {/* Results Table */}
                    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {groupedResults.map((group, groupIndex) => {
                        const isTicket = group.ticket.type === "ticket";
                        const hasComments = group.comments.length > 0;
                        const isExpanded = expandedTickets.has(group.ticket.id);
                        const ticketIndex = results.findIndex((r) => r.id === group.ticket.id && r.type === group.ticket.type);

                        return (
                          <div key={`group-${group.ticket.type}-${group.ticket.id}`}>
                            {/* Ticket/User Row */}
                            <div
                              onClick={() => handleResultClick(group.ticket)}
                              className={cn(
                                "w-full text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer",
                                selectedIndex === ticketIndex && "bg-primary-50 dark:bg-primary-950",
                                "px-4 py-4"
                              )}
                            >
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex-shrink-0 flex items-center gap-2">
                                  {isTicket && hasComments && (
                                    <button
                                      onClick={(e) => toggleTicketExpansion(group.ticket.id, e)}
                                      className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                                      aria-label={isExpanded ? "Collapse comments" : "Expand comments"}
                                      type="button"
                                    >
                                      <svg
                                        className={cn(
                                          "w-4 h-4 text-neutral-500 dark:text-neutral-400 transition-transform duration-200",
                                          isExpanded && "rotate-90"
                                        )}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 5l7 7-7 7"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                  {getResultIcon(group.ticket.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                      {highlightMatch(group.ticket.title, query)}
                                    </p>
                                    {group.ticket.type === "ticket" && group.ticket.metadata?.ticketNumber && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
                                        {group.ticket.metadata.ticketNumber}
                                      </span>
                                    )}
                                    {group.ticket.type === "user" && group.ticket.metadata?.email && group.ticket.title !== group.ticket.metadata.email && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0 truncate max-w-[120px]">
                                        {group.ticket.metadata.email}
                                      </span>
                                    )}
                                    {group.ticket.type === "timeentry" && group.ticket.metadata?.status && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                                        {group.ticket.metadata.status}
                                      </span>
                                    )}
                                    {group.ticket.type === "project" && group.ticket.metadata?.code && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
                                        {group.ticket.metadata.code}
                                      </span>
                                    )}
                                    {isTicket && hasComments && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        ({group.comments.length} comment{group.comments.length !== 1 ? "s" : ""})
                                      </span>
                                    )}
                                  </div>
                                  {group.ticket.description && (
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-2">
                                      {highlightMatch(group.ticket.description, query)}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {group.ticket.type === "ticket" && group.ticket.metadata?.status && (
                                      <span
                                        className={cn(
                                          "text-xs px-2 py-0.5 rounded-full font-medium",
                                          formatTicketStatus(group.ticket.metadata.status)
                                        )}
                                      >
                                        {group.ticket.metadata.status.replace("_", " ")}
                                      </span>
                                    )}
                                    {group.ticket.type === "ticket" && group.ticket.metadata?.priority && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        {group.ticket.metadata.priority}
                                      </span>
                                    )}
                                    {group.ticket.type === "user" && group.ticket.metadata?.role && (
                                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 capitalize">
                                        {group.ticket.metadata.role.toLowerCase()}
                                      </span>
                                    )}
                                    {group.ticket.type === "timeentry" && group.ticket.metadata?.ticketNumber && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        Ticket: {group.ticket.metadata.ticketNumber}
                                      </span>
                                    )}
                                    {group.ticket.type === "timeentry" && group.ticket.metadata?.projectCode && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        Project: {group.ticket.metadata.projectCode}
                                      </span>
                                    )}
                                    {group.ticket.type === "project" && group.ticket.metadata?.status && (
                                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 capitalize">
                                        {group.ticket.metadata.status.replace("_", " ").toLowerCase()}
                                      </span>
                                    )}
                                    {group.ticket.type === "project" && group.ticket.metadata?.priority && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        {group.ticket.metadata.priority}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Comments */}
                            {isTicket && hasComments && (
                              <div
                                className={cn(
                                  "overflow-hidden transition-all duration-300 ease-in-out",
                                  isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                                )}
                              >
                                {group.comments.map((comment, commentIndex) => {
                                  const commentResultIndex = results.findIndex((r) => r.id === comment.id && r.type === comment.type);
                                  return (
                                    <button
                                      key={`comment-${comment.id}`}
                                      onClick={() => handleResultClick(comment)}
                                      className={cn(
                                        "w-full text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all duration-300 ease-in-out",
                                        selectedIndex === commentResultIndex && "bg-primary-50 dark:bg-primary-950",
                                        "px-4 py-2 pl-12",
                                        isExpanded 
                                          ? "opacity-100 translate-y-0" 
                                          : "opacity-0 -translate-y-2"
                                      )}
                                      style={{
                                        transitionDelay: isExpanded ? `${300 + commentIndex * 30}ms` : `${(group.comments.length - commentIndex - 1) * 20}ms`,
                                      }}
                                    >
                                      <div className="flex items-start gap-4">
                                        <div className="mt-0.5 flex-shrink-0">{getResultIcon(comment.type)}</div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                              Comment in {comment.metadata?.ticketNumber}:
                                            </span>
                                          </div>
                                          <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                            {highlightMatch(comment.title, query)}
                                          </p>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-12 text-center">
                    <svg
                      className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      No results found for &quot;{query}&quot;
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // Render portal at document body level to ensure backdrop covers entire page
  // Only render portal on client side to avoid SSR hydration issues
  if (!mounted || typeof document === "undefined" || !document.body) {
    return null;
  }
  
  return createPortal(dialogContent, document.body);
};
