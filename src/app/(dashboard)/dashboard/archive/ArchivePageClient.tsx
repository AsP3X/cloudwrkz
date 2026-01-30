"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { bulkUnarchiveTodos, bulkDeleteTodos } from "@/server/actions/todos";
import { bulkUnarchiveTickets, bulkDeleteTickets } from "@/server/actions/tickets";
import { bulkUnarchiveTimeEntries, bulkDeleteTimeEntries } from "@/server/actions/time-tracking";
import { bulkUnarchiveLinks, bulkDeleteLinks } from "@/server/actions/links";
import { ArchiveFilterButton } from "./ArchiveFilterButton";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

export type ArchiveItemType = "all" | "tickets" | "todos" | "time" | "links";

export type ArchiveItem = {
  type: "ticket" | "todo" | "timeEntry" | "link";
  id: string;
  title: string;
  description: string | null;
  url: string;
  archivedAt: Date;
  subtitle?: string;
};

interface ArchivePageClientProps {
  items: ArchiveItem[];
  canView: { tickets: boolean; todos: boolean; time: boolean; links: boolean };
  initialType: ArchiveItemType;
  initialQuery: string;
  initialSort: string;
  initialArchivedFrom: string;
  initialArchivedTo: string;
  userTimezone: string;
}

const typePill = (type: ArchiveItem["type"]) => {
  switch (type) {
    case "ticket":
      return { label: "Ticket", className: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" };
    case "todo":
      return { label: "ToDo", className: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300" };
    case "timeEntry":
      return { label: "Time", className: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300" };
    case "link":
      return { label: "Link", className: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300" };
  }
};

export function ArchivePageClient({
  items,
  canView,
  initialType,
  initialQuery,
  initialSort,
  initialArchivedFrom,
  initialArchivedTo,
  userTimezone,
}: ArchivePageClientProps) {
  const router = useRouter();

  const [activeType, setActiveType] = React.useState<ArchiveItemType>(initialType);
  const [query, setQuery] = React.useState(initialQuery);
  const [sort, setSort] = React.useState(initialSort);
  const [archivedFrom, setArchivedFrom] = React.useState(initialArchivedFrom);
  const [archivedTo, setArchivedTo] = React.useState(initialArchivedTo);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isWorking, setIsWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [itemsToDeletePermanently, setItemsToDeletePermanently] = React.useState<ArchiveItem[] | null>(null);

  const itemKey = (item: ArchiveItem) => `${item.type}:${item.id}`;

  // Sync state from URL-driven server props (Filter dialog / loader)
  const lastInitialQueryRef = React.useRef(initialQuery);
  React.useEffect(() => {
    setActiveType(initialType);
    setSort(initialSort);
    setArchivedFrom(initialArchivedFrom);
    setArchivedTo(initialArchivedTo);
    // Preserve local search unless the URL-provided query actually changed.
    if (initialQuery !== lastInitialQueryRef.current) {
      setQuery((prev) => (prev === lastInitialQueryRef.current ? initialQuery : prev));
    }
    lastInitialQueryRef.current = initialQuery;
    setSelected(new Set());
    setError(null);
  }, [initialType, initialQuery, initialSort, initialArchivedFrom, initialArchivedTo]);

  const visibleItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = archivedFrom ? new Date(`${archivedFrom}T00:00:00.000Z`) : null;
    const to = archivedTo ? new Date(`${archivedTo}T23:59:59.999Z`) : null;

    const filtered = items.filter((item) => {
      if (activeType === "tickets" && item.type !== "ticket") return false;
      if (activeType === "todos" && item.type !== "todo") return false;
      if (activeType === "time" && item.type !== "timeEntry") return false;
      if (activeType === "links" && item.type !== "link") return false;

      const archivedAtMs = new Date(item.archivedAt).getTime();
      if (from && !Number.isNaN(from.getTime()) && archivedAtMs < from.getTime()) return false;
      if (to && !Number.isNaN(to.getTime()) && archivedAtMs > to.getTime()) return false;

      if (!q) return true;
      const haystack = `${item.title} ${item.subtitle ?? ""} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aArchived = new Date(a.archivedAt).getTime();
      const bArchived = new Date(b.archivedAt).getTime();

      switch (sort) {
        case "archivedAt-asc":
          return aArchived - bArchived;
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "archivedAt-desc":
        default:
          return bArchived - aArchived;
      }
    });

    return sorted;
  }, [activeType, archivedFrom, archivedTo, items, query, sort]);

  // Keep selection in sync with the currently visible set (prevents "hidden selection" when filtering/searching).
  React.useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visibleKeys = new Set(visibleItems.map(itemKey));
      const next = new Set(Array.from(prev).filter((k) => visibleKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleItems]);

  const allSelected = visibleItems.length > 0 && selected.size === visibleItems.length;
  const someSelected = selected.size > 0 && selected.size < visibleItems.length;
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleToggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visibleItems.map(itemKey)));
  };

  const handleToggleSelectOne = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleUnarchive = async (itemsToUnarchive: ArchiveItem[]) => {
    if (itemsToUnarchive.length === 0 || isWorking) return;

    setIsWorking(true);
    setError(null);

    const todos = itemsToUnarchive.filter((i) => i.type === "todo").map((i) => i.id);
    const tickets = itemsToUnarchive.filter((i) => i.type === "ticket").map((i) => i.id);
    const timeEntries = itemsToUnarchive.filter((i) => i.type === "timeEntry").map((i) => i.id);
    const links = itemsToUnarchive.filter((i) => i.type === "link").map((i) => i.id);

    try {
      const results = await Promise.all([
        todos.length ? bulkUnarchiveTodos(todos) : Promise.resolve({ success: true as const }),
        tickets.length ? bulkUnarchiveTickets(tickets) : Promise.resolve({ success: true as const }),
        timeEntries.length ? bulkUnarchiveTimeEntries(timeEntries) : Promise.resolve({ success: true as const }),
        links.length ? bulkUnarchiveLinks(links) : Promise.resolve({ success: true as const }),
      ]);

      const firstError = results.find((r) => (r as any)?.success === false) as any;
      if (firstError) {
        setError((firstError.error as string) || "Failed to unarchive some items");
        return;
      }

      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(getServerActionErrorMessage(e));
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeletePermanently = async (itemsToDelete: ArchiveItem[]) => {
    if (itemsToDelete.length === 0 || isWorking) return;

    setIsWorking(true);
    setError(null);
    setItemsToDeletePermanently(null);

    const todos = itemsToDelete.filter((i) => i.type === "todo").map((i) => i.id);
    const tickets = itemsToDelete.filter((i) => i.type === "ticket").map((i) => i.id);
    const timeEntries = itemsToDelete.filter((i) => i.type === "timeEntry").map((i) => i.id);
    const links = itemsToDelete.filter((i) => i.type === "link").map((i) => i.id);

    try {
      const results = await Promise.all([
        todos.length ? bulkDeleteTodos(todos) : Promise.resolve({ success: true as const }),
        tickets.length ? bulkDeleteTickets(tickets) : Promise.resolve({ success: true as const }),
        timeEntries.length ? bulkDeleteTimeEntries(timeEntries) : Promise.resolve({ success: true as const }),
        links.length ? bulkDeleteLinks(links) : Promise.resolve({ success: true as const }),
      ]);

      const firstError = results.find((r) => (r as { success?: boolean })?.success === false) as { error?: string } | undefined;
      if (firstError) {
        setError(firstError.error ?? "Failed to delete some items permanently");
        return;
      }

      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(getServerActionErrorMessage(e));
    } finally {
      setIsWorking(false);
    }
  };

  const selectedItems = React.useMemo(() => {
    if (selected.size === 0) return [];
    const byKey = new Map(items.map((i) => [itemKey(i), i]));
    return Array.from(selected).map((k) => byKey.get(k)).filter(Boolean) as ArchiveItem[];
  }, [items, selected]);

  return (
    <div className="space-y-6">
      {/* Delete permanently confirmation */}
      <Dialog
        open={itemsToDeletePermanently !== null}
        onOpenChange={(open) => {
          if (!open && !isWorking) setItemsToDeletePermanently(null);
        }}
        title="Delete permanently?"
        description="The selected items will be removed forever. This cannot be undone."
      >
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {itemsToDeletePermanently?.length === 1
              ? "This item will be permanently deleted."
              : `${itemsToDeletePermanently?.length ?? 0} items will be permanently deleted.`}
          </p>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItemsToDeletePermanently(null)}
              disabled={isWorking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => itemsToDeletePermanently && handleDeletePermanently(itemsToDeletePermanently)}
              disabled={isWorking || !itemsToDeletePermanently?.length}
              loading={isWorking}
            >
              {isWorking ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archive</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Archived items are hidden from the default lists, but you can still find them in search.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ArchiveFilterButton canView={canView} />
        </div>
      </div>

      {/* List controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {visibleItems.length} item{visibleItems.length !== 1 ? "s" : ""}
        </div>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="Search archived items…"
          className="h-10 w-full sm:w-80 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
        />
      </div>

      {visibleItems.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No archived items
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Archived tickets, todos, time entries, and links will show up here.
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            {selected.size > 0 && (
              <div className="bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {selected.size} item{selected.size !== 1 ? "s" : ""} selected
                  </span>
                  <div className="hidden sm:block h-6 w-px bg-neutral-300 dark:bg-neutral-600" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isWorking}
                      onClick={() => handleUnarchive(selectedItems)}
                      className="text-sm"
                    >
                      Unarchive
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isWorking}
                      onClick={() => setItemsToDeletePermanently(selectedItems)}
                      className="text-sm"
                    >
                      Delete permanently
                    </Button>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelected(new Set());
                    setError(null);
                  }}
                  className="text-sm w-full sm:w-auto"
                >
                  Clear Selection
                </Button>
              </div>
            )}

            {error && (
              <div className="px-4 sm:px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">
                    {error}
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        ref={selectAllRef}
                        checked={allSelected}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                        aria-label="Select all items"
                        suppressHydrationWarning
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                      Ref
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                      Archived
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {visibleItems.map((item) => {
                    const pill = typePill(item.type);
                    const key = itemKey(item);
                    const isSelected = selected.has(key);

                    const rowClassName = cn(
                      "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                      isSelected && "bg-primary-50 dark:bg-primary-900/20"
                    );

                    return (
                      <tr key={key} className={rowClassName}>
                        <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleToggleSelectOne(key, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                            aria-label={`Select ${pill.label}`}
                            suppressHydrationWarning
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={cn(pill.className, "text-xs")}>{pill.label}</Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                          {item.subtitle ? (
                            <span className="text-sm font-mono text-neutral-600 dark:text-neutral-400">
                              {item.subtitle}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={item.url}
                            className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                          >
                            <div className="max-w-xl">
                              <div className="truncate">{item.title}</div>
                              {item.description && (
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400 hidden lg:table-cell">
                          {formatDateTimeInTimezone(item.archivedAt, userTimezone)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Link href={item.url}>
                              <Button variant="outline" size="sm">
                                Open
                              </Button>
                            </Link>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isWorking}
                              onClick={() => handleUnarchive([item])}
                            >
                              Unarchive
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

