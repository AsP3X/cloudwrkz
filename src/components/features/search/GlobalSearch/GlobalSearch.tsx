"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchResult } from "@/server/actions/search";
import { cn } from "@/lib/utils/cn";

export const GlobalSearch = () => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await globalSearch(query, 8);
        setResults(response.results);
        setIsOpen(response.results.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      // Navigate to search results page
      router.push(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery("");
      return;
    }

    if (!isOpen || results.length === 0) {
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
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    router.push(result.url);
    setIsOpen(false);
    setQuery("");
    setResults([]);
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

  return (
    <div ref={searchRef} className="relative w-64 sm:w-80">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
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
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder="Search tickets..."
          className={cn(
            "w-full pl-10 pr-10 py-2 rounded-lg border-2 transition-all duration-200",
            "bg-white text-neutral-900 border-neutral-200",
            "dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800",
            "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            "focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400",
            "hover:border-neutral-300 dark:hover:border-neutral-700"
          )}
        />
        {isLoading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <svg
              className="animate-spin h-5 w-5 text-neutral-400"
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
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 max-h-96 overflow-y-auto">
          <div className="py-2">
            {results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleResultClick(result)}
                className={cn(
                  "w-full px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                  "border-b border-neutral-100 dark:border-neutral-800 last:border-b-0",
                  selectedIndex === index && "bg-primary-50 dark:bg-primary-950"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{getResultIcon(result.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {result.title}
                      </p>
                      {result.type === "ticket" && result.metadata?.ticketNumber && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                          {result.metadata.ticketNumber}
                        </span>
                      )}
                    </div>
                    {result.description && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1 mb-2">
                        {result.description}
                      </p>
                    )}
                    {result.type === "ticket" && result.metadata && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {result.metadata.status && (
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium",
                              formatTicketStatus(result.metadata.status)
                            )}
                          >
                            {result.metadata.status.replace("_", " ")}
                          </span>
                        )}
                        {result.metadata.priority && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {result.metadata.priority}
                          </span>
                        )}
                        {result.metadata.commentCount !== undefined && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {result.metadata.commentCount} comment
                            {result.metadata.commentCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && !isLoading && query.trim() && results.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 py-4 px-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
            No results found for "{query}"
          </p>
        </div>
      )}
    </div>
  );
};
