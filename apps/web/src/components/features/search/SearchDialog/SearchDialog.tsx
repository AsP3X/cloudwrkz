"use client";

import React, { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/server/actions/search";
import { callServerActionWithRetry } from "@/lib/utils/server-action-utils";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import Link from "next/link";
import Image from "next/image";
import {
  isEnhancedSearchQuery,
  getEnhancedSearchBody,
  parseEnhancedSearchQuery,
  ENHANCED_SEARCH_PREFIX,
  ENHANCED_SEARCH_PARAM_NAMES,
  type EnhancedSearchParams,
} from "@/lib/utils/enhanced-search";
import { SearchPreviewPanel } from "@/components/features/search/SearchPreviewPanel";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptySubscribe = () => () => {};

export const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [totalResults, setTotalResults] = useState(0);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());
  const [expandedLevel1Subtasks, setExpandedLevel1Subtasks] = useState<Set<string>>(new Set());
  const [visibleLevel2Subtasks, setVisibleLevel2Subtasks] = useState<Set<string>>(new Set());
  const [expandedLevel2Subtasks, setExpandedLevel2Subtasks] = useState<Set<string>>(new Set());
  const [visibleLevel3Subtasks, setVisibleLevel3Subtasks] = useState<Set<string>>(new Set());
  const [failedFaviconIds, setFailedFaviconIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autocompleteListRef = useRef<HTMLDivElement>(null);
  const autocompleteOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);


  useEffect(() => {
    void 0;
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Debounce search with minimum query length
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    const isEnhanced = isEnhancedSearchQuery(trimmed);
    const body = isEnhanced ? getEnhancedSearchBody(trimmed) : trimmed;
    const parsed = isEnhanced ? parseEnhancedSearchQuery(body) : null;
    const hasEnoughToSearch =
      !isEnhanced
        ? trimmed.length >= 2
        : !!parsed &&
          (!!parsed.search ||
            !!parsed.date ||
            !!parsed.timestamp ||
            !!parsed.label ||
            !!parsed.tag ||
            !!parsed.type ||
            !!parsed.description);

    if (!hasEnoughToSearch) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (isEnhanced && parsed) {
          const { enhancedSearch } = await import("@/server/actions/search");
          const response = await callServerActionWithRetry(
            () => enhancedSearch(parsed as EnhancedSearchParams),
            1
          );
          setResults(response.results);
          setTotalResults(response.total);
          setSelectedIndex(-1);
        } else {
          const { globalSearch } = await import("@/server/actions/search");
          const response = await callServerActionWithRetry(
            () => globalSearch(trimmed, 20),
            1
          );
          setResults(response.results);
          setTotalResults(response.total);
          setSelectedIndex(-1);
        }
      } catch (error: any) {
        console.error("Search error:", error);
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Autocomplete suggestions for enhanced search (">" mode)
  const enhancedSuggestions = React.useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      return [...ENHANCED_SEARCH_PARAM_NAMES];
    }
    if (!isEnhancedSearchQuery(trimmed)) return [];
    const body = getEnhancedSearchBody(trimmed);
    const lastComma = body.lastIndexOf(",");
    const lastSegment = (lastComma >= 0 ? body.slice(lastComma + 1) : body).trim();
    if (lastSegment.includes(':"')) return [];
    const prefix = lastSegment.toLowerCase();
    return ENHANCED_SEARCH_PARAM_NAMES.filter(
      (p) => p.key.startsWith(prefix) || prefix === ""
    );
  }, [query]);

  useEffect(() => {
    setAutocompleteIndex(0);
  }, [enhancedSuggestions.length]);

  // Keep the selected autocomplete option in view when navigating with arrow keys
  useEffect(() => {
    const el = autocompleteOptionRefs.current[autocompleteIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [autocompleteIndex]);

  const getLastSegment = () => {
    if (!isEnhancedSearchQuery(query)) return "";
    const body = getEnhancedSearchBody(query);
    const lastComma = body.lastIndexOf(",");
    return (lastComma >= 0 ? body.slice(lastComma + 1) : body).trim();
  };

  /** Body text before the cursor (after the ">" if present). */
  const getBodyBeforeCursor = (): string => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? query.length;
    const beforeCursor = query.slice(0, start);
    const trimmed = beforeCursor.trimStart();
    if (trimmed.startsWith(ENHANCED_SEARCH_PREFIX)) return trimmed.slice(ENHANCED_SEARCH_PREFIX.length).trimStart();
    return beforeCursor;
  };

  /** True if cursor is inside an unclosed quoted value in enhanced search (odd " and inside a param). */
  const isInsideOpenQuotedValue = (): boolean => {
    const bodyBefore = getBodyBeforeCursor();
    let count = 0;
    for (let i = 0; i < bodyBefore.length; i++) {
      if (bodyBefore[i] === '"' && (i === 0 || bodyBefore[i - 1] !== "\\")) count++;
    }
    if (count % 2 !== 1) return false;
    return /(?:^|\s)search\s*"|\b(?:date|timestamp|label|tag|type|description)\s*:\s*"/i.test(bodyBefore);
  };

  /** Count of complete param values (key: "value" or search "value") in body. */
  const countClosedParams = (body: string): number => {
    const matches = body.match(/(?:search\s*"[^"]*"|(?:date|timestamp|label|tag|type|description)\s*:\s*"[^"]*")/gi);
    return matches ? matches.length : 0;
  };

  const applyCloseQuoteAndMaybeComma = () => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? query.length;
    const end = input.selectionEnd ?? start;
    const bodyBefore = getBodyBeforeCursor();
    const bodyWithClose = bodyBefore + '"';
    const closedCount = countClosedParams(bodyWithClose);
    const suffix = closedCount < ENHANCED_SEARCH_PARAM_NAMES.length ? '", ' : '"';
    const before = query.slice(0, start);
    const after = query.slice(end);
    const next = before + suffix + after;
    setQuery(next);
    requestAnimationFrame(() => {
      input.setSelectionRange(start + suffix.length, start + suffix.length);
      input.focus();
    });
  };

  const applySuggestion = (snippet: string) => {
    const input = inputRef.current;
    if (!input) return;
    const lastSegment = getLastSegment();
    const completion = lastSegment && snippet.startsWith(lastSegment)
      ? snippet.slice(lastSegment.length)
      : snippet;
    const start = input.selectionStart ?? query.length;
    const end = input.selectionEnd ?? start;
    let before = query.slice(0, start);
    const after = query.slice(end);
    if (query.trim() === "" && !before.startsWith(ENHANCED_SEARCH_PREFIX)) {
      before = ENHANCED_SEARCH_PREFIX + before;
    }
    const next = before + completion + after;
    setQuery(next);
    requestAnimationFrame(() => {
      const newPos = start + completion.length + (query.trim() === "" ? ENHANCED_SEARCH_PREFIX.length : 0);
      input.setSelectionRange(newPos, newPos);
      input.focus();
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
      setQuery("");
      setResults([]);
      return;
    }

    if (e.key === "Tab") {
      if (isInsideOpenQuotedValue()) {
        e.preventDefault();
        applyCloseQuoteAndMaybeComma();
        return;
      }
      if (enhancedSuggestions.length > 0) {
        e.preventDefault();
        const suggestion = enhancedSuggestions[autocompleteIndex] ?? enhancedSuggestions[0];
        if (suggestion) applySuggestion(suggestion.snippet);
        return;
      }
    }

    if (e.key === "Enter" && enhancedSuggestions.length > 0) {
      e.preventDefault();
      const suggestion = enhancedSuggestions[autocompleteIndex] ?? enhancedSuggestions[0];
      if (suggestion) applySuggestion(suggestion.snippet);
      return;
    }

    if (enhancedSuggestions.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      if (e.key === "ArrowDown") {
        setAutocompleteIndex((i) => (i < enhancedSuggestions.length - 1 ? i + 1 : 0));
      } else {
        setAutocompleteIndex((i) => (i > 0 ? i - 1 : enhancedSuggestions.length - 1));
      }
      return;
    }

    if (e.key === "Enter" && selectedIndex >= 0 && visibleItems[selectedIndex]) {
      e.preventDefault();
      handleResultClick(visibleItems[selectedIndex]);
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

    if (visibleItems.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === -1) return 0; // Start from first item
          return prev < visibleItems.length - 1 ? prev + 1 : prev;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === -1) return visibleItems.length - 1; // Start from last item
          return prev > 0 ? prev - 1 : -1;
        });
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

  // Group results by ticket/task
  const groupedResults = React.useMemo(() => {
    const groups: Array<{ ticket: SearchResult; comments: SearchResult[]; subtaskHierarchy?: Map<string, SearchResult[]>; level3Hierarchy?: Map<string, SearchResult[]> }> = [];
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
        // Check if this is a subtask
        if (result.metadata?.isSubtask && result.metadata?.rootTaskId) {
          // Group by root task ID to support nested subtasks
          const rootTaskId = result.metadata.rootTaskId as string;
          const subtasks = subtaskMap.get(rootTaskId) || [];
          subtasks.push(result);
          subtaskMap.set(rootTaskId, subtasks);
        } else {
          // Parent task
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

    // Add tasks with their subtasks (displayed like comments)
    // Build hierarchical structure for nested subtasks
    taskMap.forEach((task) => {
      const allSubtasks = subtaskMap.get(task.id) || [];
      
      // Create maps to organize subtasks by their parent
      // Map: level 2 subtasks grouped by their level 1 parent
      const level2ByParent = new Map<string, SearchResult[]>();
      // Map: level 3 subtasks grouped by their level 2 parent
      const level3ByParent = new Map<string, SearchResult[]>();
      
      // Separate subtasks by level
      const level1Subtasks: SearchResult[] = [];
      
      allSubtasks.forEach((subtask) => {
        const level = (subtask.metadata?.level as number) || 1;
        const parentTaskId = subtask.metadata?.parentTaskId as string;
        
        if (level === 1) {
          level1Subtasks.push(subtask);
        } else if (level === 2 && parentTaskId) {
          // Level 2 subtasks: group by their level 1 parent
          if (!level2ByParent.has(parentTaskId)) {
            level2ByParent.set(parentTaskId, []);
          }
          level2ByParent.get(parentTaskId)!.push(subtask);
        } else if (level === 3 && parentTaskId) {
          // Level 3 subtasks: group by their level 2 parent
          if (!level3ByParent.has(parentTaskId)) {
            level3ByParent.set(parentTaskId, []);
          }
          level3ByParent.get(parentTaskId)!.push(subtask);
        }
      });
      
      // Sort function for subtasks
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
      
      // Sort level 1 subtasks
      sortSubtasks(level1Subtasks);
      
      // Sort level 2 and level 3 subtasks within each parent
      level2ByParent.forEach((subtasks) => sortSubtasks(subtasks));
      level3ByParent.forEach((subtasks) => sortSubtasks(subtasks));
      
      // Only show level 1 subtasks in the main list
      // Level 2 and 3 will be shown via toggles
      groups.push({
        ticket: task,
        comments: level1Subtasks,
        subtaskHierarchy: level2ByParent.size > 0 ? level2ByParent : undefined, // Map of level 2 subtasks by their level 1 parent
        level3Hierarchy: level3ByParent.size > 0 ? level3ByParent : undefined, // Map of level 3 subtasks by their level 2 parent
      });
    });

    return groups;
  }, [results]);

  // Create a flat list of visible items in display order for navigation
  const visibleItems = React.useMemo(() => {
    const items: SearchResult[] = [];
    groupedResults.forEach((group) => {
      // Always add the main item (ticket/task/user/etc.)
      items.push(group.ticket);
      // Add comments/subtasks only if the parent is expanded
      if ((group.ticket.type === "ticket" || group.ticket.type === "task") && expandedTickets.has(group.ticket.id)) {
        items.push(...group.comments);
      }
    });
    return items;
  }, [groupedResults, expandedTickets]);

  // Reset selection if the currently selected item is no longer visible
  useEffect(() => {
    if (selectedIndex >= visibleItems.length) {
      setSelectedIndex(-1);
    }
  }, [visibleItems.length, selectedIndex]);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setTotalResults(0);
    inputRef.current?.focus();
  };

  /** Search terms used for finding match snippets (handles enhanced search). */
  const getSearchTermsForSnippet = (q: string): string[] => {
    const trimmed = q.trim();
    if (!trimmed) return [];
    if (isEnhancedSearchQuery(trimmed)) {
      const body = getEnhancedSearchBody(trimmed);
      const parsed = parseEnhancedSearchQuery(body);
      const combined =
        [parsed?.search, parsed?.label, parsed?.tag, parsed?.description]
          .filter(Boolean)
          .join(" ") || body;
      return combined.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
    }
    return trimmed.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  };

  /** Build a short snippet showing where the match appears, with surrounding text. */
  const getMatchSnippet = (
    result: SearchResult,
    searchTerms: string[],
    padding = 45
  ): string | null => {
    if (searchTerms.length === 0) return null;
    const sources: string[] = [];
    if (result.context) sources.push(result.context);
    if (result.title) sources.push(result.title);
    if (result.description) sources.push(result.description);
    for (const source of sources) {
      if (!source) continue;
      const lower = source.toLowerCase();
      let bestIdx = -1;
      let bestLen = 0;
      for (const term of searchTerms) {
        const idx = lower.indexOf(term.toLowerCase());
        if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
          bestIdx = idx;
          bestLen = term.length;
        }
      }
      if (bestIdx < 0) continue;
      const start = Math.max(0, bestIdx - padding);
      const end = Math.min(source.length, bestIdx + bestLen + padding);
      let snippet = source.slice(start, end).trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < source.length) snippet = snippet + "…";
      return snippet;
    }
    return null;
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
        role="presentation"
        className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-md z-[100] animate-fade-in"
        onClick={() => {
          onOpenChange(false);
          setQuery("");
          setResults([]);
        }}
      />
      
      {/* Dialog */}
      <div
        role="presentation"
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
            "w-full max-h-[80vh] overflow-hidden flex flex-col",
            selectedIndex >= 0 && results.length > 0 ? "max-w-5xl" : "max-w-4xl",
            "animate-slide-in pointer-events-auto"
          )}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          {/* Search Input - overflow-visible so autocomplete dropdown is not clipped */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 overflow-visible">
            <div className="relative overflow-visible">
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
                placeholder={
                  isEnhancedSearchQuery(query)
                    ? 'search "text", type: "tickets", date: "2024-01-01"...'
                    : "Search tickets, users, time entries, settings..."
                }
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
              {/* Enhanced search autocomplete - all items shown, arrow keys to navigate */}
              {enhancedSuggestions.length > 0 && (
                <div
                  ref={autocompleteListRef}
                  className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl py-1 overflow-y-auto max-h-[min(16rem,70vh)]"
                  role="listbox"
                  aria-activedescendant={enhancedSuggestions[autocompleteIndex] ? `autocomplete-option-${autocompleteIndex}` : undefined}
                >
                  <p className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800 sticky top-0 bg-white dark:bg-neutral-900">
                    Tab to apply · ↑↓ to navigate
                  </p>
                  {enhancedSuggestions.map((param, idx) => (
                    <button
                      key={param.key}
                      id={`autocomplete-option-${idx}`}
                      ref={(el) => {
                        autocompleteOptionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={idx === autocompleteIndex}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors",
                        idx === autocompleteIndex
                          ? "bg-primary-50 dark:bg-primary-950 text-primary-800 dark:text-primary-200"
                          : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applySuggestion(param.snippet);
                      }}
                    >
                      <span className="font-medium">{param.label}</span>
                      <span className="text-neutral-500 dark:text-neutral-400 ml-2 text-xs">
                        {param.key === "type" ? "tickets, todo, links, users, …" : `"value"`}
                        {param.kind === "fuzzy" && " · fuzzy"}
                        {param.kind === "strict" && " · strict (exact)"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {query.trim().length > 0 && query.trim().length < 2 && !isEnhancedSearchQuery(query) && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                Type at least 2 characters to search
              </p>
            )}
          </div>

          {/* Results + Preview split */}
          <div className="flex-1 overflow-hidden flex min-h-0">
          {/* Results list */}
          <div ref={resultsRef} className={cn(
            "overflow-y-auto",
            selectedIndex >= 0 && results.length > 0 ? "w-full md:w-1/2 md:border-r border-neutral-200 dark:border-neutral-800" : "w-full"
          )}>
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
                        const isTask = group.ticket.type === "task";
                        const hasComments = group.comments.length > 0;
                        const isExpanded = expandedTickets.has(group.ticket.id);
                        // Check if this ticket/task is selected in the visible items list
                        const isTicketSelected = selectedIndex >= 0 && visibleItems[selectedIndex]?.id === group.ticket.id && visibleItems[selectedIndex]?.type === group.ticket.type;

                        return (
                          <div key={`group-${group.ticket.type}-${group.ticket.id}`}>
                            {/* Ticket/User Row */}
                            <div
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResultClick(group.ticket); } }}
                              onClick={() => handleResultClick(group.ticket)}
                              className={cn(
                                "w-full text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer",
                                isTicketSelected && "bg-primary-50 dark:bg-primary-950",
                                "px-4 py-4"
                              )}
                            >
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex-shrink-0 flex items-center gap-2">
                                  {(isTicket || isTask) && hasComments && (
                                    <button
                                      onClick={(e) => toggleTicketExpansion(group.ticket.id, e)}
                                      className="p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                                      aria-label={isExpanded ? `Collapse ${isTask ? "subtasks" : "comments"}` : `Expand ${isTask ? "subtasks" : "comments"}`}
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
                                  {group.ticket.type === "link" &&
                                  group.ticket.metadata?.favicon &&
                                  !failedFaviconIds.has(group.ticket.id) ? (
                                    <Image
                                      src={group.ticket.metadata.favicon}
                                      alt=""
                                      width={20}
                                      height={20}
                                      className="w-5 h-5 rounded object-contain flex-shrink-0"
                                      unoptimized
                                      onError={() =>
                                        setFailedFaviconIds((prev) => new Set(prev).add(group.ticket.id))
                                      }
                                    />
                                  ) : (
                                    getResultIcon(group.ticket.type)
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                      {highlightMatch(group.ticket.title, query)}
                                    </p>
                                    {(group.ticket.metadata as any)?.archivedAt && (
                                      <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                                        Archived
                                      </span>
                                    )}
                                    {group.ticket.type === "ticket" && group.ticket.metadata?.ticketNumber && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
                                        {group.ticket.metadata.ticketNumber}
                                      </span>
                                    )}
                                    {group.ticket.type === "task" && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
                                        {group.ticket.metadata?.taskNumber || group.ticket.id.slice(0, 8) + "..."}
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
                                    {group.ticket.type === "link" && group.ticket.metadata?.rating !== null && group.ticket.metadata?.rating !== undefined && (
                                      <span className="flex items-center gap-1 flex-shrink-0">
                                        <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">{group.ticket.metadata.rating}</span>
                                      </span>
                                    )}
                                    {(isTicket || group.ticket.type === "task") && hasComments && (
                                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                        ({group.comments.length} {group.ticket.type === "task" ? "subtask" : "comment"}{group.comments.length !== 1 ? "s" : ""})
                                      </span>
                                    )}
                                  </div>
                                  {group.ticket.description && (
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-2">
                                      {highlightMatch(group.ticket.description, query)}
                                    </p>
                                  )}
                                  {(() => {
                                    const searchTerms = getSearchTermsForSnippet(query);
                                    const snippet =
                                      group.ticket.context ??
                                      (searchTerms.length > 0 ? getMatchSnippet(group.ticket, searchTerms) : null);
                                    if (!snippet) return null;
                                    const isServerContext = !!group.ticket.context;
                                    return (
                                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-2 italic">
                                        {isServerContext ? (
                                          highlightMatch(group.ticket.context!, group.ticket.contextHighlight ?? query)
                                        ) : (
                                          <>
                                            <span className="text-neutral-400 dark:text-neutral-500 not-italic font-medium">Match: </span>
                                            {highlightMatch(snippet, query)}
                                          </>
                                        )}
                                      </p>
                                    );
                                  })()}
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
                                  </div>
                                  {group.ticket.type === "timeentry" && group.ticket.metadata && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                      {group.ticket.metadata.createdAt && (
                                        <span>Created: {formatDate(group.ticket.metadata.createdAt)}</span>
                                      )}
                                      {typeof group.ticket.metadata.breakDurationSeconds === "number" && group.ticket.metadata.breakDurationSeconds > 0 && (
                                        <span>Break: {Math.floor(group.ticket.metadata.breakDurationSeconds / 3600)}h {Math.floor((group.ticket.metadata.breakDurationSeconds % 3600) / 60)}m</span>
                                      )}
                                      {group.ticket.metadata.location && (
                                        <span className="truncate max-w-[200px]" title={group.ticket.metadata.location as string}>Location: {group.ticket.metadata.location}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Comments / Subtasks */}
                            {(isTicket || isTask) && hasComments && (
                              <div
                                className={cn(
                                  "overflow-hidden transition-all duration-300 ease-in-out",
                                  isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                                )}
                              >
                                {group.comments.map((comment, commentIndex) => {
                                  const isSubtask = comment.metadata?.isSubtask;
                                  const subtaskLevel = (comment.metadata?.level as number) || 1;
                                  
                                  // For level 1 subtasks: check if they have level 2 children
                                  const hasLevel2Children = isSubtask && subtaskLevel === 1 && group.subtaskHierarchy && group.subtaskHierarchy.has(comment.id);
                                  const level2Children = hasLevel2Children ? group.subtaskHierarchy!.get(comment.id)! : [];
                                  const isLevel1Expanded = expandedLevel1Subtasks.has(comment.id);
                                  const shouldShowLevel2 = visibleLevel2Subtasks.has(comment.id);
                                  
                                  // Check if this comment/subtask is selected in the visible items list
                                  const isCommentSelected = selectedIndex >= 0 && visibleItems[selectedIndex]?.id === comment.id && visibleItems[selectedIndex]?.type === comment.type;
                                  
                                  return (
                                    <React.Fragment key={`${isSubtask ? "subtask" : "comment"}-${comment.id}`}>
                                      {/* Level 1 Subtask */}
                                      <div
                                        className={cn(
                                          "w-full transition-all duration-300 ease-in-out",
                                          isExpanded 
                                            ? "opacity-100 translate-y-0" 
                                            : "opacity-0 -translate-y-2"
                                        )}
                                        style={{
                                          transitionDelay: isExpanded ? `${300 + commentIndex * 30}ms` : `${(group.comments.length - commentIndex - 1) * 20}ms`,
                                        }}
                                      >
                                        <div className={cn(
                                          "flex items-start gap-4 px-4 py-2 pl-12 hover:bg-neutral-50 dark:hover:bg-neutral-800",
                                          isCommentSelected && "bg-primary-50 dark:bg-primary-950"
                                        )}>
                                          <div className="mt-0.5 flex-shrink-0 flex items-center gap-2">
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
                                          <button
                                            onClick={() => handleResultClick(comment)}
                                            className="flex-1 min-w-0 text-left"
                                          >
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                {isSubtask ? (
                                                  `Subtask (Level ${subtaskLevel}) in ${comment.metadata?.parentTaskTitle || "task"}:`
                                                ) : (
                                                  `Comment in ${comment.metadata?.ticketNumber}:`
                                                )}
                                              </span>
                                            </div>
                                            <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                              {highlightMatch(comment.title, query)}
                                            </p>
                                            {getSearchTermsForSnippet(query).length > 0 && (() => {
                                              const commentSnippet = getMatchSnippet(comment, getSearchTermsForSnippet(query), 40);
                                              if (!commentSnippet || commentSnippet === comment.title) return null;
                                              return (
                                                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 italic">
                                                  <span className="text-neutral-400 dark:text-neutral-500 not-italic font-medium">Match: </span>
                                                  {highlightMatch(commentSnippet, query)}
                                                </p>
                                              );
                                            })()}
                                          </button>
                                        </div>
                                      </div>
                                      
                                      {/* Level 2 Subtasks (nested under level 1) */}
                                      {isSubtask && hasLevel2Children && shouldShowLevel2 && level2Children.map((level2Subtask, level2Index) => {
                                        const level2Delay = level2Index * 20;
                                        const hasLevel3Children = group.level3Hierarchy && group.level3Hierarchy.has(level2Subtask.id);
                                        const level3Children = hasLevel3Children ? group.level3Hierarchy!.get(level2Subtask.id)! : [];
                                        const isLevel2Expanded = expandedLevel2Subtasks.has(level2Subtask.id);
                                        const shouldShowLevel3 = visibleLevel3Subtasks.has(level2Subtask.id);
                                        
                                        return (
                                          <React.Fragment key={`level2-subtask-${level2Subtask.id}`}>
                                            <div
                                              className={cn(
                                                "w-full transition-all duration-300 ease-in-out",
                                                isLevel1Expanded 
                                                  ? "opacity-100 translate-y-0" 
                                                  : "opacity-0 -translate-y-2"
                                              )}
                                              style={{
                                                transitionDelay: isLevel1Expanded 
                                                  ? `${level2Delay}ms` 
                                                  : `${(level2Children.length - level2Index - 1) * 15}ms`,
                                              }}
                                            >
                                              <div className="flex items-start gap-4 px-4 py-2 pl-12 hover:bg-neutral-50 dark:hover:bg-neutral-800" style={{ paddingLeft: "96px" }}>
                                                <div className="mt-0.5 flex-shrink-0 flex items-center gap-2">
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
                                                <button
                                                  onClick={() => handleResultClick(level2Subtask)}
                                                  className="flex-1 min-w-0 text-left"
                                                >
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                      {`Subtask (Level 2) in ${level2Subtask.metadata?.parentTaskTitle || "task"}:`}
                                                    </span>
                                                  </div>
                                                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                                    {highlightMatch(level2Subtask.title, query)}
                                                  </p>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Level 3 Subtasks (nested under level 2) */}
                                            {hasLevel3Children && shouldShowLevel3 && level3Children.map((level3Subtask, level3Index) => {
                                              const level3Delay = level3Index * 15;
                                              return (
                                                <div
                                                  key={`level3-subtask-${level3Subtask.id}`}
                                                  className={cn(
                                                    "w-full transition-all duration-300 ease-in-out",
                                                    isLevel2Expanded 
                                                      ? "opacity-100 translate-y-0" 
                                                      : "opacity-0 -translate-y-2"
                                                  )}
                                                  style={{
                                                    transitionDelay: isLevel2Expanded 
                                                      ? `${level3Delay}ms` 
                                                      : `${(level3Children.length - level3Index - 1) * 10}ms`,
                                                  }}
                                                >
                                                  <div className="flex items-start gap-4 px-4 py-2 pl-12 hover:bg-neutral-50 dark:hover:bg-neutral-800" style={{ paddingLeft: "112px" }}>
                                                    <div className="mt-0.5 flex-shrink-0">
                                                      {getResultIcon(level3Subtask.type)}
                                                    </div>
                                                    <button
                                                      onClick={() => handleResultClick(level3Subtask)}
                                                      className="flex-1 min-w-0 text-left"
                                                    >
                                                      <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                          {`Subtask (Level 3) in ${level3Subtask.metadata?.parentTaskTitle || "task"}:`}
                                                        </span>
                                                      </div>
                                                      <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                                        {highlightMatch(level3Subtask.title, query)}
                                                      </p>
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </React.Fragment>
                                        );
                                      })}
                                    </React.Fragment>
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
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      No results are available
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      No results found for &quot;{query.trim()}&quot;
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                      Try adjusting your search or filters.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Inline preview panel — only on md+ when a result is selected */}
          {selectedIndex >= 0 && results.length > 0 && (
            <div className="hidden md:flex md:w-1/2 border-l border-neutral-200 dark:border-neutral-800 flex-col overflow-hidden">
              <SearchPreviewPanel
                result={visibleItems[selectedIndex] ?? null}
                onNavigate={() => {
                  onOpenChange(false);
                  setQuery("");
                  setResults([]);
                }}
              />
            </div>
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
