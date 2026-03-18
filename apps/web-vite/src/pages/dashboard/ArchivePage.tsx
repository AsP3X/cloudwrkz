import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

export type ArchiveItemType = "all" | "tickets" | "todos" | "time" | "links";

export type ArchiveItem = {
  type: "ticket" | "todo" | "timeEntry" | "link";
  id: string;
  title: string;
  description: string | null;
  url: string;
  archivedAt: string;
  subtitle?: string;
};

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

export default function ArchivePage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<ArchiveItemType>(
    (searchParams.get("type") as ArchiveItemType) || "all"
  );
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [sort] = useState(searchParams.get("sort") || "archivedAt-desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsToDeletePermanently, setItemsToDeletePermanently] = useState<ArchiveItem[] | null>(null);

  const itemKey = (item: ArchiveItem) => `${item.type}:${item.id}`;

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: ArchiveItem[] }>("/archive");
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArchived(); }, [fetchArchived]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (activeType === "tickets" && item.type !== "ticket") return false;
      if (activeType === "todos" && item.type !== "todo") return false;
      if (activeType === "time" && item.type !== "timeEntry") return false;
      if (activeType === "links" && item.type !== "link") return false;
      if (!q) return true;
      const haystack = `${item.title} ${item.subtitle ?? ""} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aArchived = new Date(a.archivedAt).getTime();
      const bArchived = new Date(b.archivedAt).getTime();
      switch (sort) {
        case "archivedAt-asc": return aArchived - bArchived;
        case "title-asc": return a.title.localeCompare(b.title);
        case "title-desc": return b.title.localeCompare(a.title);
        case "archivedAt-desc":
        default: return bArchived - aArchived;
      }
    });

    return sorted;
  }, [activeType, items, query, sort]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visibleKeys = new Set(visibleItems.map(itemKey));
      const next = new Set(Array.from(prev).filter((k) => visibleKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleItems]);

  const allSelected = visibleItems.length > 0 && selected.size === visibleItems.length;
  const someSelected = selected.size > 0 && selected.size < visibleItems.length;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleToggleSelectAll = (checked: boolean) => {
    if (!checked) { setSelected(new Set()); return; }
    setSelected(new Set(visibleItems.map(itemKey)));
  };

  const handleToggleSelectOne = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleUnarchive = async (itemsToUnarchive: ArchiveItem[]) => {
    if (itemsToUnarchive.length === 0 || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const types = [...new Set(itemsToUnarchive.map((i) => i.type))];
      await Promise.all(types.map((t) => {
        const typeIds = itemsToUnarchive.filter((i) => i.type === t).map((i) => i.id);
        const endpoint = t === "ticket" ? "/tickets" : t === "todo" ? "/todos" : t === "link" ? "/links" : "/time-tracking";
        return Promise.all(typeIds.map((id) => api.patch(`${endpoint}/${id}`, { archived_at: null })));
      }));
      setSelected(new Set());
      fetchArchived();
    } catch (e: any) {
      setError(e?.message || "Failed to unarchive some items");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeletePermanently = async (itemsToDelete: ArchiveItem[]) => {
    if (itemsToDelete.length === 0 || isWorking) return;
    setIsWorking(true);
    setError(null);
    setItemsToDeletePermanently(null);
    try {
      const types = [...new Set(itemsToDelete.map((i) => i.type))];
      await Promise.all(types.map((t) => {
        const typeIds = itemsToDelete.filter((i) => i.type === t).map((i) => i.id);
        const endpoint = t === "ticket" ? "/tickets" : t === "todo" ? "/todos" : t === "link" ? "/links" : "/time-tracking";
        return Promise.all(typeIds.map((id) => api.delete(`${endpoint}/${id}`)));
      }));
      setSelected(new Set());
      fetchArchived();
    } catch (e: any) {
      setError(e?.message || "Failed to delete some items permanently");
    } finally {
      setIsWorking(false);
    }
  };

  const selectedItems = useMemo(() => {
    if (selected.size === 0) return [];
    const byKey = new Map(items.map((i) => [itemKey(i), i]));
    return Array.from(selected).map((k) => byKey.get(k)).filter(Boolean) as ArchiveItem[];
  }, [items, selected]);

  const allTypeCounts = useMemo(() => ({
    tickets: items.filter((i) => i.type === "ticket").length,
    todos: items.filter((i) => i.type === "todo").length,
    time: items.filter((i) => i.type === "timeEntry").length,
    links: items.filter((i) => i.type === "link").length,
  }), [items]);

  type Tab = { key: ArchiveItemType; label: string; count: number };
  const tabs: Tab[] = [
    { key: "all", label: "All", count: items.length },
    { key: "tickets", label: "Tickets", count: allTypeCounts.tickets },
    { key: "todos", label: "Todos", count: allTypeCounts.todos },
    { key: "time", label: "Time Entries", count: allTypeCounts.time },
    { key: "links", label: "Links", count: allTypeCounts.links },
  ];

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archive</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Archived items are hidden from the default lists, but you can still find them in search.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveType(tab.key);
              setSelected(new Set());
              setError(null);
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px",
              activeType === tab.key
                ? "border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300"
                : "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300 dark:hover:border-neutral-600"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold",
                activeType === tab.key
                  ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

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

      {loading ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No archived items
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Archived tickets, todos, time entries, and links will show up here.
          </p>
        </div>
      ) : (
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

                  return (
                    <tr
                      key={key}
                      className={cn(
                        "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                        isSelected && "bg-primary-50 dark:bg-primary-900/20"
                      )}
                    >
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
                          to={item.url}
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
                        {formatDateTime(item.archivedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Link to={item.url}>
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
      )}
    </div>
  );
}
