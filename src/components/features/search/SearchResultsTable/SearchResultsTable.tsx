"use client";

import React from "react";
import Link from "next/link";
import { type SearchResult } from "@/server/actions/search";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

interface SearchResultsTableProps {
  results: SearchResult[];
  searchQuery?: string;
}

export const SearchResultsTable = ({ results, searchQuery = "" }: SearchResultsTableProps) => {
  const [expandedTickets, setExpandedTickets] = React.useState<Set<string>>(new Set());
  const [visibleComments, setVisibleComments] = React.useState<Set<string>>(new Set());

  const toggleTicketExpansion = (ticketId: string) => {
    const isCurrentlyExpanded = expandedTickets.has(ticketId);
    
    if (isCurrentlyExpanded) {
      // Collapsing - trigger animation first
      setExpandedTickets((prev) => {
        const newSet = new Set(prev);
        newSet.delete(ticketId);
        return newSet;
      });
      // Hide from DOM after animation completes
      setTimeout(() => {
        setVisibleComments((prev) => {
          const newSet = new Set(prev);
          newSet.delete(ticketId);
          return newSet;
        });
      }, 600); // Wait for all animations to complete
    } else {
      // Expanding - add to visible first so rows are in DOM
      setVisibleComments((prev) => {
        const newSet = new Set(prev);
        newSet.add(ticketId);
        return newSet;
      });
      // Trigger animation after DOM is ready
      // Use requestAnimationFrame to ensure browser has painted the rows first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setExpandedTickets((prev) => {
            const newSet = new Set(prev);
            newSet.add(ticketId);
            return newSet;
          });
        });
      });
    }
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
  const highlightMatch = (text: string, searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return text;
    
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => {
      // Check if this part matches the search term (case-insensitive)
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded px-0.5">
            {part}
          </mark>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  const getStatusColor = (status: string) => {
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

  const getPriorityColor = (priority: string) => {
    const priorityColors: Record<string, string> = {
      LOW: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
      MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      URGENT: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    };
    return priorityColors[priority] || priorityColors.MEDIUM;
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
    return (
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
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    );
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                ID/Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden md:table-cell">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden lg:table-cell">
                Assigned To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden lg:table-cell">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider hidden xl:table-cell">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {groupedResults.map((group) => {
              const isTicket = group.ticket.type === "ticket";
              const hasComments = group.comments.length > 0;
              const isExpanded = expandedTickets.has(group.ticket.id);
              const shouldShowComments = visibleComments.has(group.ticket.id);

              return (
                <React.Fragment key={`group-${group.ticket.type}-${group.ticket.id}`}>
                  {/* Ticket/User Row */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-b border-neutral-200 dark:border-neutral-800">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isTicket && hasComments && (
                          <button
                            onClick={() => toggleTicketExpansion(group.ticket.id)}
                            className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                            aria-label={isExpanded ? "Collapse comments" : "Expand comments"}
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
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.ticketNumber ? (
                        <Link
                          href={group.ticket.url}
                          className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          {group.ticket.metadata.ticketNumber}
                        </Link>
                      ) : group.ticket.type === "user" && group.ticket.metadata?.email ? (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {group.ticket.metadata.email}
                        </span>
                      ) : group.ticket.type === "timeentry" ? (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {group.ticket.id.slice(0, 8)}...
                        </span>
                      ) : group.ticket.type === "project" && group.ticket.metadata?.code ? (
                        <Link
                          href={group.ticket.url}
                          className="text-sm font-mono font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          {group.ticket.metadata.code}
                        </Link>
                      ) : (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {group.ticket.id.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={group.ticket.url}
                        className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        <div className="max-w-md">
                          <div className="truncate">{highlightMatch(group.ticket.title, searchQuery)}</div>
                          {group.ticket.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                              {highlightMatch(group.ticket.description, searchQuery)}
                            </div>
                          )}
                          {group.ticket.type === "user" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {group.ticket.metadata.createdTicketsCount || 0} created, {group.ticket.metadata.assignedTicketsCount || 0} assigned
                            </div>
                          )}
                          {group.ticket.type === "timeentry" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {group.ticket.metadata.ticketNumber && `Ticket: ${group.ticket.metadata.ticketNumber} • `}
                              {group.ticket.metadata.projectCode && `Project: ${group.ticket.metadata.projectCode} • `}
                              {group.ticket.metadata.totalDuration && `${Math.floor((group.ticket.metadata.totalDuration as number) / 3600)}h ${Math.floor(((group.ticket.metadata.totalDuration as number) % 3600) / 60)}m`}
                            </div>
                          )}
                          {group.ticket.type === "project" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {group.ticket.metadata.ticketCount || 0} tickets • {group.ticket.metadata.timeEntryCount || 0} time entries • {group.ticket.metadata.memberCount || 0} members
                            </div>
                          )}
                          {isTicket && hasComments && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              ({group.comments.length} comment{group.comments.length !== 1 ? "s" : ""})
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.status ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            group.ticket.metadata.status
                          )}`}
                        >
                          {group.ticket.metadata.status.replace("_", " ")}
                        </span>
                      ) : group.ticket.type === "user" && group.ticket.metadata?.role ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 capitalize">
                          {group.ticket.metadata.role.toLowerCase()}
                        </span>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.status ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 capitalize">
                          {group.ticket.metadata.status.toLowerCase()}
                        </span>
                      ) : group.ticket.type === "project" && group.ticket.metadata?.status ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 capitalize">
                          {group.ticket.metadata.status.replace("_", " ").toLowerCase()}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.priority ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                            group.ticket.metadata.priority
                          )}`}
                        >
                          {group.ticket.metadata.priority}
                        </span>
                      ) : group.ticket.type === "user" && group.ticket.metadata?.status ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          group.ticket.metadata.status === "ACTIVE" 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : group.ticket.metadata.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                        }`}>
                          {group.ticket.metadata.status}
                        </span>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.totalDuration ? (
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          {Math.floor((group.ticket.metadata.totalDuration as number) / 3600)}h {Math.floor(((group.ticket.metadata.totalDuration as number) % 3600) / 60)}m
                        </span>
                      ) : group.ticket.type === "project" && group.ticket.metadata?.priority ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                            group.ticket.metadata.priority
                          )}`}
                        >
                          {group.ticket.metadata.priority}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.type ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {getTicketTypeLabel(group.ticket.metadata.type as TicketType)}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      {group.ticket.type === "ticket" && group.ticket.metadata ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.ticket.metadata.assignedTo ? (
                            group.ticket.metadata.assignedTo
                          ) : group.ticket.metadata.assignedToGroup ? (
                            <>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">Group: </span>
                              {group.ticket.metadata.assignedToGroup}
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                          )}
                        </div>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.user ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.ticket.metadata.user}
                        </div>
                      ) : group.ticket.type === "project" && group.ticket.metadata?.createdBy ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.ticket.metadata.createdBy}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.createdAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDate(group.ticket.metadata.createdAt)}
                        </div>
                      ) : group.ticket.type === "user" && group.ticket.metadata?.createdAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDate(group.ticket.metadata.createdAt)}
                        </div>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.startedAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDate(group.ticket.metadata.startedAt)}
                        </div>
                      ) : group.ticket.type === "project" && group.ticket.metadata?.createdAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDate(group.ticket.metadata.createdAt)}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden xl:table-cell">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.updatedAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDateTime(group.ticket.metadata.updatedAt)}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                  </tr>

                  {/* Comments */}
                  {isTicket && hasComments && shouldShowComments && (
                    <>
                      {group.comments.map((comment, commentIndex) => {
                        // Staggered delay for each comment
                        const commentDelay = commentIndex * 30;
                        
                        return (
                          <tr
                            key={`comment-${comment.id}`}
                            className={cn(
                              "bg-neutral-50/50 dark:bg-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800",
                              isExpanded 
                                ? "opacity-100 translate-y-0" 
                                : "opacity-0 -translate-y-2"
                            )}
                            style={{
                              transitionProperty: "opacity, transform",
                              transitionDuration: "300ms",
                              transitionTimingFunction: "ease-in-out",
                              transitionDelay: isExpanded 
                                ? `${commentDelay}ms` 
                                : `${(group.comments.length - commentIndex - 1) * 20}ms`,
                              willChange: "opacity, transform",
                            }}
                          >
                          <td className="pl-12 pr-6 py-2 whitespace-nowrap">
                            <div className="flex items-center">
                              {getResultIcon(comment.type)}
                            </div>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap">
                            {comment.metadata?.ticketNumber && (
                              <Link
                                href={comment.url}
                                className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                              >
                                {comment.metadata.ticketNumber}
                              </Link>
                            )}
                          </td>
                          <td className="px-6 py-2">
                            <Link
                              href={comment.url}
                              className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              <div className="max-w-md">
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                                  Comment in {comment.metadata?.ticketTitle}:
                                </div>
                                <div className="truncate">{highlightMatch(comment.title, searchQuery)}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap">
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap">
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap hidden md:table-cell">
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap hidden lg:table-cell">
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap hidden lg:table-cell">
                            {comment.metadata?.createdAt && (
                              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                {formatDate(comment.metadata.createdAt)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-2 whitespace-nowrap hidden xl:table-cell">
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                          </td>
                        </tr>
                        );
                      })}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
