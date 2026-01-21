"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { bulkUnarchiveTodos } from "@/server/actions/todos";
import { bulkUnarchiveTickets } from "@/server/actions/tickets";
import { bulkUnarchiveTimeEntries } from "@/server/actions/time-tracking";

export type ArchiveItemType = "all" | "tickets" | "todos" | "time";

export type ArchiveItem = {
  type: "ticket" | "todo" | "timeEntry";
  id: string;
  title: string;
  description: string | null;
  url: string;
  archivedAt: Date;
  subtitle?: string;
};

interface ArchivePageClientProps {
  items: ArchiveItem[];
  canView: { tickets: boolean; todos: boolean; time: boolean };
  initialType: ArchiveItemType;
  initialQuery: string;
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
  }
};

export function ArchivePageClient({
  items,
  canView,
  initialType,
  initialQuery,
  userTimezone,
}: ArchivePageClientProps) {
  const router = useRouter();

  const [activeType, setActiveType] = React.useState<ArchiveItemType>(initialType);
  const [query, setQuery] = React.useState(initialQuery);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isWorking, setIsWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const visibleItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeType === "tickets" && item.type !== "ticket") return false;
      if (activeType === "todos" && item.type !== "todo") return false;
      if (activeType === "time" && item.type !== "timeEntry") return false;
      if (!q) return true;
      const haystack = `${item.title} ${item.subtitle ?? ""} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activeType, items, query]);

  const allSelected = visibleItems.length > 0 && selected.size === visibleItems.length;
  const someSelected = selected.size > 0 && selected.size < visibleItems.length;
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const itemKey = (item: ArchiveItem) => `${item.type}:${item.id}`;

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

    try {
      const results = await Promise.all([
        todos.length ? bulkUnarchiveTodos(todos) : Promise.resolve({ success: true as const }),
        tickets.length ? bulkUnarchiveTickets(tickets) : Promise.resolve({ success: true as const }),
        timeEntries.length ? bulkUnarchiveTimeEntries(timeEntries) : Promise.resolve({ success: true as const }),
      ]);

      const firstError = results.find((r) => (r as any)?.success === false) as any;
      if (firstError) {
        setError((firstError.error as string) || "Failed to unarchive some items");
        return;
      }

      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError("An unexpected error occurred");
    } finally {
      setIsWorking(false);
    }
  };

  const selectedItems = React.useMemo(() => {
    if (selected.size === 0) return [];
    const byKey = new Map(items.map((i) => [itemKey(i), i]));
    return Array.from(selected).map((k) => byKey.get(k)).filter(Boolean) as ArchiveItem[];
  }, [items, selected]);

  const tabs = [
    { key: "all" as const, label: "All", enabled: true },
    { key: "tickets" as const, label: "Tickets", enabled: canView.tickets },
    { key: "todos" as const, label: "ToDos", enabled: canView.todos },
    { key: "time" as const, label: "Time entries", enabled: canView.time },
  ].filter((t) => t.enabled) satisfies ReadonlyArray<{ key: ArchiveItemType; label: string; enabled: boolean }>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archive</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Archived items are hidden from the default lists and search.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search archived items…"
            className="h-10 w-64 max-w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
          />
          {selected.size > 0 && (
            <Button variant="primary" disabled={isWorking} onClick={() => handleUnarchive(selectedItems)}>
              Unarchive ({selected.size})
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setActiveType(t.key);
              setSelected(new Set());
              setError(null);
            }}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition-colors",
              activeType === t.key
                ? "bg-primary-50 dark:bg-primary-900/40 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300"
                : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg p-3 text-sm text-error-800 dark:text-error-200">
          {error}
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No archived items
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Archived tickets, todos, and time entries will show up here.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Showing {visibleItems.length} item{visibleItems.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={allSelected}
                onChange={(e) => handleToggleSelectAll(e.target.checked)}
                className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                aria-label="Select all"
                suppressHydrationWarning
              />
              <span>Select all</span>
            </div>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {visibleItems.map((item) => {
              const pill = typePill(item.type);
              const key = itemKey(item);
              const isSelected = selected.has(key);
              return (
                <div key={key} className={cn("p-4 sm:p-6", isSelected && "bg-primary-50/40 dark:bg-primary-900/10")}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggleSelectOne(key, e.target.checked)}
                      className="w-4 h-4 mt-1 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                      aria-label="Select item"
                      suppressHydrationWarning
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn(pill.className, "text-[10px] px-2 py-0.5")}>{pill.label}</Badge>
                        {item.subtitle && (
                          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                            {item.subtitle}
                          </span>
                        )}
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          Archived {formatDateTimeInTimezone(item.archivedAt, userTimezone)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={item.url}
                            className="font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                          >
                            {item.title}
                          </Link>
                          {item.description && (
                            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

