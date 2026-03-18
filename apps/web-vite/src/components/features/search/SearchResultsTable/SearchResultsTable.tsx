import React from "react";
import { Link } from "react-router-dom";
import type { SearchResult } from "../types";
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
  const [expandedLevel1Subtasks, setExpandedLevel1Subtasks] = React.useState<Set<string>>(new Set());
  const [visibleLevel2Subtasks, setVisibleLevel2Subtasks] = React.useState<Set<string>>(new Set());
  const [expandedLevel2Subtasks, setExpandedLevel2Subtasks] = React.useState<Set<string>>(new Set());
  const [visibleLevel3Subtasks, setVisibleLevel3Subtasks] = React.useState<Set<string>>(new Set());
  const [failedFaviconIds, setFailedFaviconIds] = React.useState<Set<string>>(new Set());

  const toggleTicketExpansion = (ticketId: string) => {
    const isCurrentlyExpanded = expandedTickets.has(ticketId);
    
    if (isCurrentlyExpanded) {
      setExpandedTickets((prev) => {
        const newSet = new Set(prev);
        newSet.delete(ticketId);
        return newSet;
      });
      setTimeout(() => {
        setVisibleComments((prev) => {
          const newSet = new Set(prev);
          newSet.delete(ticketId);
          return newSet;
        });
      }, 600);
    } else {
      setVisibleComments((prev) => {
        const newSet = new Set(prev);
        newSet.add(ticketId);
        return newSet;
      });
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

  const toggleLevel1SubtaskExpansion = (subtaskId: string) => {
    const isCurrentlyExpanded = expandedLevel1Subtasks.has(subtaskId);
    
    if (isCurrentlyExpanded) {
      setExpandedLevel1Subtasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(subtaskId);
        return newSet;
      });
      setTimeout(() => {
        setVisibleLevel2Subtasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(subtaskId);
          return newSet;
        });
      }, 300);
    } else {
      setVisibleLevel2Subtasks((prev) => {
        const newSet = new Set(prev);
        newSet.add(subtaskId);
        return newSet;
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setExpandedLevel1Subtasks((prev) => {
            const newSet = new Set(prev);
            newSet.add(subtaskId);
            return newSet;
          });
        });
      });
    }
  };

  const toggleLevel2SubtaskExpansion = (subtaskId: string) => {
    const isCurrentlyExpanded = expandedLevel2Subtasks.has(subtaskId);
    
    if (isCurrentlyExpanded) {
      setExpandedLevel2Subtasks((prev) => {
        const newSet = new Set(prev);
        newSet.delete(subtaskId);
        return newSet;
      });
      setTimeout(() => {
        setVisibleLevel3Subtasks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(subtaskId);
          return newSet;
        });
      }, 300);
    } else {
      setVisibleLevel3Subtasks((prev) => {
        const newSet = new Set(prev);
        newSet.add(subtaskId);
        return newSet;
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setExpandedLevel2Subtasks((prev) => {
            const newSet = new Set(prev);
            newSet.add(subtaskId);
            return newSet;
          });
        });
      });
    }
  };

  const groupedResults = React.useMemo(() => {
    const groups: Array<{ ticket: SearchResult; comments: SearchResult[]; subtaskHierarchy?: Map<string, SearchResult[]>; level3Hierarchy?: Map<string, SearchResult[]> }> = [];
    if (!Array.isArray(results) || results.length === 0) return groups;
    const ticketMap = new Map<string, SearchResult>();
    const taskMap = new Map<string, SearchResult>();
    const commentMap = new Map<string, SearchResult[]>();
    const subtaskMap = new Map<string, SearchResult[]>();

    results.forEach((result) => {
      if (result.type === "ticket") {
        ticketMap.set(result.id, result);
        if (!commentMap.has(result.id)) {
          commentMap.set(result.id, []);
        }
      } else if (result.type === "task") {
        if (result.metadata?.isSubtask && result.metadata?.rootTaskId) {
          const rootTaskId = result.metadata.rootTaskId as string;
          const subtasks = subtaskMap.get(rootTaskId) || [];
          subtasks.push(result);
          subtaskMap.set(rootTaskId, subtasks);
        } else {
          taskMap.set(result.id, result);
          if (!subtaskMap.has(result.id)) {
            subtaskMap.set(result.id, []);
          }
        }
      } else if (result.type === "comment" && result.parentTicketId) {
        const comments = commentMap.get(result.parentTicketId) || [];
        comments.push(result);
        commentMap.set(result.parentTicketId, comments);
      } else {
        groups.push({ ticket: result, comments: [] });
      }
    });

    ticketMap.forEach((ticket) => {
      groups.push({
        ticket,
        comments: commentMap.get(ticket.id) || [],
      });
    });

    taskMap.forEach((task) => {
      const allSubtasks = subtaskMap.get(task.id) || [];
      
      const level2ByParent = new Map<string, SearchResult[]>();
      const level3ByParent = new Map<string, SearchResult[]>();
      
      const level1Subtasks: SearchResult[] = [];
      
      allSubtasks.forEach((subtask) => {
        const level = (subtask.metadata?.level as number) || 1;
        const parentTaskId = subtask.metadata?.parentTaskId as string;
        
        if (level === 1) {
          level1Subtasks.push(subtask);
        } else if (level === 2 && parentTaskId) {
          if (!level2ByParent.has(parentTaskId)) {
            level2ByParent.set(parentTaskId, []);
          }
          level2ByParent.get(parentTaskId)!.push(subtask);
        } else if (level === 3 && parentTaskId) {
          if (!level3ByParent.has(parentTaskId)) {
            level3ByParent.set(parentTaskId, []);
          }
          level3ByParent.get(parentTaskId)!.push(subtask);
        }
      });
      
      const sortSubtasks = (subtasks: SearchResult[]) => {
        return subtasks.sort((a, b) => {
          const chainA = (a.metadata?.parentChain as string[]) || [];
          const chainB = (b.metadata?.parentChain as string[]) || [];
          for (let i = 0; i < Math.min(chainA.length, chainB.length); i++) {
            if (chainA[i] !== chainB[i]) {
              return chainA[i].localeCompare(chainB[i]);
            }
          }
          return chainA.length - chainB.length;
        });
      };
      
      sortSubtasks(level1Subtasks);
      
      level2ByParent.forEach((subtasks) => sortSubtasks(subtasks));
      level3ByParent.forEach((subtasks) => sortSubtasks(subtasks));
      
      groups.push({
        ticket: task,
        comments: level1Subtasks,
        subtaskHierarchy: level2ByParent.size > 0 ? level2ByParent : undefined,
        level3Hierarchy: level3ByParent.size > 0 ? level3ByParent : undefined,
      });
    });

    return groups;
  }, [results]);

  const highlightMatch = (text: string, searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return text;

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
            key={`part-${index}`}
            className="bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded px-0.5"
          >
            {part}
          </mark>
        );
      }
      return <React.Fragment key={`part-${index}`}>{part}</React.Fragment>;
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
    if (type === "task") {
      return (
        <svg
          className="w-5 h-5 text-indigo-600 dark:text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v11a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5v4h6"
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
    if (type === "link") {
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
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
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
              const isTask = group.ticket.type === "task";
              const hasComments = group.comments.length > 0;
              const isExpanded = expandedTickets.has(group.ticket.id);
              const shouldShowComments = visibleComments.has(group.ticket.id);
              const isArchived = Boolean((group.ticket.metadata as any)?.archivedAt);

              return (
                <React.Fragment key={`group-${group.ticket.type}-${group.ticket.id}`}>
                  {/* Ticket/User Row */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors border-b border-neutral-200 dark:border-neutral-800">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {(isTicket || isTask) && hasComments && (
                          <button
                            onClick={() => toggleTicketExpansion(group.ticket.id)}
                            className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                            aria-label={isExpanded ? `Collapse ${isTask ? "subtasks" : "comments"}` : `Expand ${isTask ? "subtasks" : "comments"}`}
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
                        {group.ticket.type === "link" &&
                        group.ticket.metadata?.favicon &&
                        !failedFaviconIds.has(group.ticket.id) ? (
                          <img
                            src={group.ticket.metadata.favicon as string}
                            alt=""
                            width={20}
                            height={20}
                            className="w-5 h-5 rounded object-contain flex-shrink-0"
                            onError={() =>
                              setFailedFaviconIds((prev) => new Set(prev).add(group.ticket.id))
                            }
                          />
                        ) : (
                          getResultIcon(group.ticket.type)
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.ticket.type === "ticket" && group.ticket.metadata?.ticketNumber ? (
                        <Link
                          to={group.ticket.url}
                          className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          {group.ticket.metadata.ticketNumber}
                        </Link>
                      ) : group.ticket.type === "task" ? (
                        <Link
                          to={group.ticket.url}
                          className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          {group.ticket.metadata?.taskNumber || group.ticket.id.slice(0, 8) + "..."}
                        </Link>
                      ) : group.ticket.type === "user" && group.ticket.metadata?.email ? (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {group.ticket.metadata.email}
                        </span>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.timerNumber ? (
                        <Link
                          to={group.ticket.url}
                          className="text-sm font-mono font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                        >
                          {group.ticket.metadata.timerNumber}
                        </Link>
                      ) : group.ticket.type === "link" && group.ticket.metadata?.linkUrl ? (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {new URL(group.ticket.metadata.linkUrl).hostname}
                        </span>
                      ) : group.ticket.type === "setting" ? (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          Settings
                        </span>
                      ) : (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {group.ticket.id.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={group.ticket.url}
                        className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        <div className="max-w-md">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="truncate">{highlightMatch(group.ticket.title, searchQuery)}</div>
                            {isArchived && (
                              <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                                Archived
                              </span>
                            )}
                          </div>
                          {group.ticket.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                              {highlightMatch(group.ticket.description, searchQuery)}
                            </div>
                          )}
                          {group.ticket.context && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1 italic">
                              {highlightMatch(group.ticket.context, group.ticket.contextHighlight ?? searchQuery)}
                            </div>
                          )}
                          {group.ticket.type === "user" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              {group.ticket.metadata.createdTicketsCount || 0} created, {group.ticket.metadata.assignedTicketsCount || 0} assigned
                            </div>
                          )}
                          {group.ticket.type === "timeentry" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 space-y-0.5">
                              <div>
                                {group.ticket.metadata.ticketNumber && `Ticket: ${group.ticket.metadata.ticketNumber} • `}
                                {group.ticket.metadata.totalDuration != null && `${Math.floor((group.ticket.metadata.totalDuration as number) / 3600)}h ${Math.floor(((group.ticket.metadata.totalDuration as number) % 3600) / 60)}m`}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {group.ticket.metadata.createdAt && (
                                  <span>Created: {formatDate(group.ticket.metadata.createdAt)}</span>
                                )}
                                {typeof group.ticket.metadata.breakDurationSeconds === "number" && group.ticket.metadata.breakDurationSeconds > 0 && (
                                  <span>Break: {Math.floor(group.ticket.metadata.breakDurationSeconds / 3600)}h {Math.floor((group.ticket.metadata.breakDurationSeconds % 3600) / 60)}m</span>
                                )}
                                {group.ticket.metadata.location && (
                                  <span className="truncate max-w-xs" title={group.ticket.metadata.location}>Location: {group.ticket.metadata.location}</span>
                                )}
                              </div>
                            </div>
                          )}
                          {group.ticket.type === "link" && group.ticket.metadata && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-2">
                              {group.ticket.metadata.linkUrl && (
                                <span className="truncate max-w-md">{group.ticket.metadata.linkUrl}</span>
                              )}
                              {group.ticket.metadata.rating !== null && group.ticket.metadata.rating !== undefined && (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  <span className="font-medium text-yellow-600 dark:text-yellow-400">{group.ticket.metadata.rating}</span>
                                </span>
                              )}
                            </div>
                          )}
                          {(isTicket || isTask) && hasComments && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                              ({group.comments.length} {isTask ? "subtask" : "comment"}{group.comments.length !== 1 ? "s" : ""})
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
                      ) : group.ticket.type === "task" && group.ticket.metadata?.status ? (
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
                      ) : group.ticket.type === "setting" && group.ticket.metadata?.category ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 capitalize">
                          {group.ticket.metadata.category}
                        </span>
                      ) : group.ticket.type === "link" && group.ticket.metadata?.linkType ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 capitalize">
                          {group.ticket.metadata.linkType}
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
                      ) : group.ticket.type === "task" && group.ticket.metadata?.priority ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                            group.ticket.metadata.priority
                          )}`}
                        >
                          {group.ticket.metadata.priority}
                        </span>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.totalDuration ? (
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          {Math.floor((group.ticket.metadata.totalDuration as number) / 3600)}h {Math.floor(((group.ticket.metadata.totalDuration as number) % 3600) / 60)}m
                        </span>
                      ) : group.ticket.type === "link" && group.ticket.metadata?.isFavorite ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                          Favorite
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
                      ) : group.ticket.type === "task" && group.ticket.metadata ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.ticket.metadata.assignedTo ? (
                            group.ticket.metadata.assignedTo
                          ) : (
                            <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                          )}
                        </div>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.user ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.ticket.metadata.user}
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
                      ) : group.ticket.type === "task" && group.ticket.metadata?.createdAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDate(group.ticket.metadata.createdAt)}
                        </div>
                      ) : group.ticket.type === "timeentry" && group.ticket.metadata?.createdAt ? (
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
                      ) : group.ticket.type === "task" && group.ticket.metadata?.updatedAt ? (
                        <div className="text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDateTime(group.ticket.metadata.updatedAt)}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                      )}
                    </td>
                  </tr>

                  {/* Comments / Subtasks */}
                  {(isTicket || isTask) && hasComments && shouldShowComments && (
                    <>
                      {group.comments.map((comment, commentIndex) => {
                        const commentDelay = commentIndex * 30;
                        const isSubtask = comment.metadata?.isSubtask;
                        const subtaskLevel = (comment.metadata?.level as number) || 1;
                        
                        const hasLevel2Children = isSubtask && subtaskLevel === 1 && group.subtaskHierarchy && group.subtaskHierarchy.has(comment.id);
                        const level2Children = hasLevel2Children ? group.subtaskHierarchy!.get(comment.id)! : [];
                        const isLevel1Expanded = expandedLevel1Subtasks.has(comment.id);
                        const shouldShowLevel2 = visibleLevel2Subtasks.has(comment.id);
                        
                        return (
                          <React.Fragment key={`${isSubtask ? "subtask" : "comment"}-${comment.id}`}>
                            {/* Level 1 Subtask */}
                            <tr
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

                              }}
                            >
                            <td className="pl-12 pr-6 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {isSubtask && hasLevel2Children && (
                                  <button
                                    onClick={() => toggleLevel1SubtaskExpansion(comment.id)}
                                    className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                                    aria-label={isLevel1Expanded ? "Collapse level 2 subtasks" : "Expand level 2 subtasks"}
                                  >
                                    <svg
                                      className={cn(
                                        "w-3 h-3 text-neutral-500 dark:text-neutral-400 transition-transform duration-200",
                                        isLevel1Expanded && "rotate-90"
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
                                {getResultIcon(comment.type)}
                              </div>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap">
                              {isSubtask && comment.metadata?.parentTaskTitle ? (
                                <Link
                                  to={comment.url}
                                  className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                >
                                  {group.ticket.metadata?.taskNumber || "Task"}
                                </Link>
                              ) : comment.metadata?.ticketNumber ? (
                                <Link
                                  to={comment.url}
                                  className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
                                >
                                  {comment.metadata.ticketNumber}
                                </Link>
                              ) : null}
                            </td>
                            <td className="px-6 py-2">
                              <Link
                                to={comment.url}
                                className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
                              >
                                <div className="max-w-md">
                                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                                    {isSubtask ? (
                                      `Subtask (Level ${subtaskLevel}) in ${comment.metadata?.parentTaskTitle || "task"}:`
                                    ) : (
                                      `Comment in ${comment.metadata?.ticketTitle}:`
                                    )}
                                  </div>
                                  <div className="truncate">
                                    {highlightMatch(comment.title, searchQuery)}
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-6 py-2 whitespace-nowrap">
                              {isSubtask && comment.metadata?.status ? (
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                    comment.metadata.status
                                  )}`}
                                >
                                  {comment.metadata.status.replace("_", " ")}
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                              )}
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
                          
                          {/* Level 2 Subtasks */}
                          {isSubtask && hasLevel2Children && shouldShowLevel2 && level2Children.map((level2Subtask, level2Index) => {
                            const level2Delay = level2Index * 20;
                            const hasLevel3Children = group.level3Hierarchy && group.level3Hierarchy.has(level2Subtask.id);
                            const level3Children = hasLevel3Children ? group.level3Hierarchy!.get(level2Subtask.id)! : [];
                            const isLevel2Expanded = expandedLevel2Subtasks.has(level2Subtask.id);
                            const shouldShowLevel3 = visibleLevel3Subtasks.has(level2Subtask.id);
                            
                            return (
                              <React.Fragment key={`level2-subtask-${level2Subtask.id}`}>
                                <tr
                                  className={cn(
                                    "bg-neutral-50/40 dark:bg-neutral-800/40 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800",
                                    isLevel1Expanded 
                                      ? "opacity-100 translate-y-0" 
                                      : "opacity-0 -translate-y-2"
                                  )}
                                  style={{
                                    transitionProperty: "opacity, transform",
                                    transitionDuration: "300ms",
                                    transitionTimingFunction: "ease-in-out",
                                    transitionDelay: isLevel1Expanded 
                                      ? `${level2Delay}ms` 
                                      : `${(level2Children.length - level2Index - 1) * 15}ms`,

                                  }}
                                >
                                  <td className="pl-12 pr-6 py-2 whitespace-nowrap">
                                    <div className="flex items-center gap-2" style={{ paddingLeft: "48px" }}>
                                      {hasLevel3Children && (
                                        <button
                                          onClick={() => toggleLevel2SubtaskExpansion(level2Subtask.id)}
                                          className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                                          aria-label={isLevel2Expanded ? "Collapse level 3 subtasks" : "Expand level 3 subtasks"}
                                        >
                                          <svg
                                            className={cn(
                                              "w-3 h-3 text-neutral-500 dark:text-neutral-400 transition-transform duration-200",
                                              isLevel2Expanded && "rotate-90"
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
                                      {getResultIcon(level2Subtask.type)}
                                    </div>
                                  </td>
                                  <td className="px-6 py-2 whitespace-nowrap">
                                    <Link
                                      to={level2Subtask.url}
                                      className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    >
                                      {group.ticket.metadata?.taskNumber || "Task"}
                                    </Link>
                                  </td>
                                  <td className="px-6 py-2">
                                    <Link
                                      to={level2Subtask.url}
                                      className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
                                    >
                                      <div className="max-w-md">
                                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                                          {`Subtask (Level 2) in ${level2Subtask.metadata?.parentTaskTitle || "task"}:`}
                                        </div>
                                        <div className="truncate">
                                          {highlightMatch(level2Subtask.title, searchQuery)}
                                        </div>
                                      </div>
                                    </Link>
                                  </td>
                                  <td className="px-6 py-2 whitespace-nowrap">
                                    {level2Subtask.metadata?.status ? (
                                      <span
                                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                          level2Subtask.metadata.status as string
                                        )}`}
                                      >
                                        {(level2Subtask.metadata.status as string).replace("_", " ")}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                                    )}
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
                                    {level2Subtask.metadata?.createdAt && (
                                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                        {formatDate(level2Subtask.metadata.createdAt as Date)}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-2 whitespace-nowrap hidden xl:table-cell">
                                    <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                                  </td>
                                </tr>
                                
                                {/* Level 3 Subtasks */}
                                {hasLevel3Children && shouldShowLevel3 && level3Children.map((level3Subtask, level3Index) => {
                                  const level3Delay = level3Index * 15;
                                  return (
                                    <tr
                                      key={`level3-subtask-${level3Subtask.id}`}
                                      className={cn(
                                        "bg-neutral-50/30 dark:bg-neutral-800/30 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800",
                                        isLevel2Expanded 
                                          ? "opacity-100 translate-y-0" 
                                          : "opacity-0 -translate-y-2"
                                      )}
                                      style={{
                                        transitionProperty: "opacity, transform",
                                        transitionDuration: "300ms",
                                        transitionTimingFunction: "ease-in-out",
                                        transitionDelay: isLevel2Expanded 
                                          ? `${level3Delay}ms` 
                                          : `${(level3Children.length - level3Index - 1) * 10}ms`,

                                      }}
                                    >
                                      <td className="pl-12 pr-6 py-2 whitespace-nowrap">
                                        <div className="flex items-center" style={{ paddingLeft: "64px" }}>
                                          {getResultIcon(level3Subtask.type)}
                                        </div>
                                      </td>
                                      <td className="px-6 py-2 whitespace-nowrap">
                                        <Link
                                          to={level3Subtask.url}
                                          className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                        >
                                          {group.ticket.metadata?.taskNumber || "Task"}
                                        </Link>
                                      </td>
                                      <td className="px-6 py-2">
                                        <Link
                                          to={level3Subtask.url}
                                          className="text-sm text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
                                        >
                                        <div className="max-w-md">
                                          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                                            {`Subtask (Level 3) in ${level3Subtask.metadata?.parentTaskTitle || "task"}:`}
                                          </div>
                                          <div className="truncate">
                                            {highlightMatch(level3Subtask.title, searchQuery)}
                                          </div>
                                        </div>
                                        </Link>
                                      </td>
                                      <td className="px-6 py-2 whitespace-nowrap">
                                        {level3Subtask.metadata?.status ? (
                                          <span
                                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                              level3Subtask.metadata.status as string
                                            )}`}
                                          >
                                            {(level3Subtask.metadata.status as string).replace("_", " ")}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                                        )}
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
                                        {level3Subtask.metadata?.createdAt && (
                                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                                            {formatDate(level3Subtask.metadata.createdAt as Date)}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-6 py-2 whitespace-nowrap hidden xl:table-cell">
                                        <span className="text-xs text-neutral-400 dark:text-neutral-500">-</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
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
