"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDateTimeFull } from "@/lib/utils/date";
import type {
  GetAuditLogResult,
  AuditLogEntry,
} from "@/server/actions/admin/audit";
import { exportAuditLog } from "@/server/actions/admin/audit";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

const AUDIT_COLUMN_WIDTHS_KEY = "audit-log-column-widths";

const COLUMN_KEYS = ["time", "action", "user", "resource", "ip", "context"] as const;
const DEFAULT_COLUMN_WIDTH_EQUAL = 165;

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = Object.fromEntries(
  COLUMN_KEYS.map((k) => [k, DEFAULT_COLUMN_WIDTH_EQUAL])
) as Record<string, number>;

const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 600;

const PAGE_SIZES = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
] as const;

const RESOURCE_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "link", label: "Link" },
  { value: "collection", label: "Collection" },
];

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getActionCategory(action: string): string | null {
  if (action.startsWith("auth.")) return "Auth";
  if (action.startsWith("links.")) return "Links";
  if (action.startsWith("collections.")) return "Collections";
  return null;
}

interface AuditLogPageClientProps {
  initialData: GetAuditLogResult;
  actionOptions: string[];
  canExport: boolean;
}

function loadColumnWidthsFromStorage(): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUDIT_COLUMN_WIDTHS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const out = { ...DEFAULT_COLUMN_WIDTHS };
    COLUMN_KEYS.forEach((key) => {
      if (typeof parsed[key] === "number" && parsed[key] >= MIN_COLUMN_WIDTH && parsed[key] <= MAX_COLUMN_WIDTH) {
        out[key] = parsed[key];
      }
    });
    return out;
  } catch {
    return null;
  }
}

function saveColumnWidths(widths: Record<string, number>) {
  try {
    localStorage.setItem(AUDIT_COLUMN_WIDTHS_KEY, JSON.stringify(widths));
  } catch {
    // ignore
  }
}

export function AuditLogPageClient(props: AuditLogPageClientProps) {
  return (
    <Suspense fallback={null}>
      <AuditLogPageClientInner {...props} />
    </Suspense>
  );
}

function AuditLogPageClientInner({
  initialData,
  actionOptions,
  canExport,
}: AuditLogPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>(() => initialData.entries);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [resize, setResize] = useState<{
    leftKey: string;
    rightKey: string | null;
    startX: number;
    startLeftWidth: number;
    startRightWidth: number;
  } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const colRefs = useRef<Record<string, HTMLTableColElement | null>>({});
  const currentWidthsRef = useRef<Record<string, number>>({ ...DEFAULT_COLUMN_WIDTHS });

  useEffect(() => {
    const saved = loadColumnWidthsFromStorage();
    if (saved) setColumnWidths(saved);
  }, []);

  const startResize = useCallback((key: string, clientX: number) => {
    setColumnWidths((prev) => {
      currentWidthsRef.current = { ...prev };
      const idx = COLUMN_KEYS.indexOf(key as (typeof COLUMN_KEYS)[number]);
      const leftWidth = prev[key] ?? DEFAULT_COLUMN_WIDTHS[key];
      const rightKey = idx >= 0 && idx < COLUMN_KEYS.length - 1 ? COLUMN_KEYS[idx + 1] : null;
      const rightWidth = rightKey ? (prev[rightKey] ?? DEFAULT_COLUMN_WIDTHS[rightKey]) : 0;
      setResize({
        leftKey: key,
        rightKey,
        startX: clientX,
        startLeftWidth: leftWidth,
        startRightWidth: rightWidth,
      });
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!resize) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resize.startX;
      const newLeftWidth = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, resize.startLeftWidth + delta)
      );
      const actualDelta = newLeftWidth - resize.startLeftWidth;
      if (resize.rightKey) {
        const newRightWidth = Math.min(
          MAX_COLUMN_WIDTH,
          Math.max(MIN_COLUMN_WIDTH, resize.startRightWidth - actualDelta)
        );
        currentWidthsRef.current[resize.leftKey] = newLeftWidth;
        currentWidthsRef.current[resize.rightKey] = newRightWidth;
        const colLeft = colRefs.current[resize.leftKey];
        const colRight = colRefs.current[resize.rightKey];
        if (colLeft) colLeft.style.width = `${newLeftWidth}px`;
        if (colRight) colRight.style.width = `${newRightWidth}px`;
      } else {
        currentWidthsRef.current[resize.leftKey] = newLeftWidth;
        const colLeft = colRefs.current[resize.leftKey];
        if (colLeft) colLeft.style.width = `${newLeftWidth}px`;
      }
      const total = COLUMN_KEYS.reduce(
        (sum, k) => sum + (currentWidthsRef.current[k] ?? DEFAULT_COLUMN_WIDTHS[k]),
        0
      );
      const table = tableRef.current;
      if (table) table.style.minWidth = `${total}px`;
    };
    const onUp = () => {
      setColumnWidths((prev) => {
        const next = { ...prev, ...currentWidthsRef.current };
        saveColumnWidths(next);
        return next;
      });
      setResize(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resize]);

  const currentPage = initialData.page;
  const totalPages = initialData.totalPages;
  const total = initialData.total;
  const limit = initialData.limit;
  const from = (currentPage - 1) * limit + 1;
  const to = Math.min(currentPage * limit, total);

  const actionParam = searchParams.get("action") ?? "";
  const searchParam = searchParams.get("search") ?? "";
  const resourceTypeParam = searchParams.get("resourceType") ?? "";
  const fromDateParam = searchParams.get("from") ?? "";
  const toDateParam = searchParams.get("to") ?? "";
  const limitParam = searchParams.get("limit") ?? "50";
  const sortOrderParam = searchParams.get("sortOrder") ?? "desc";

  const [fromDateValue, setFromDateValue] = useState(fromDateParam);
  const [toDateValue, setToDateValue] = useState(toDateParam);

  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      const resetPage =
        "action" in updates ||
        "search" in updates ||
        "resourceType" in updates ||
        "from" in updates ||
        "to" in updates;
      if (resetPage) updates.page = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      });
      router.push(`/dashboard/admin/audit?${params.toString()}`);
    },
    [router, searchParams]
  );

  const actionSelectOptions = useMemo(
    () => [
      { value: "", label: "All actions" },
      ...actionOptions.map((a) => ({ value: a, label: a })),
    ],
    [actionOptions]
  );

  const hasAnyFilter =
    actionParam ||
    searchParam ||
    resourceTypeParam ||
    fromDateParam ||
    toDateParam;

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      setExporting(format);
      try {
        const { blob, filename } = await exportAuditLog(
          {
            action: actionParam || undefined,
            userSearch: searchParam || undefined,
            resourceType: resourceTypeParam || undefined,
            from: fromDateParam || undefined,
            to: toDateParam || undefined,
            limit: undefined,
            sortOrder: sortOrderParam === "asc" ? "asc" : "desc",
          },
          format
        );
        const url = URL.createObjectURL(
          new Blob([blob], {
            type: format === "json" ? "application/json" : "text/csv",
          })
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(null);
      }
    },
    [
      actionParam,
      searchParam,
      resourceTypeParam,
      fromDateParam,
      toDateParam,
      sortOrderParam,
    ]
  );

  const quickRanges = useMemo(
    () => ({
      today: () => {
        const d = new Date();
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const fromStr = formatDateForInput(start);
        const toStr = formatDateForInput(d);
        setFromDateValue(fromStr);
        setToDateValue(toStr);
        updateParams({
          from: fromStr,
          to: toStr,
        });
      },
      last7: () => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        const fromStr = formatDateForInput(start);
        const toStr = formatDateForInput(end);
        updateParams({
          from: fromStr,
          to: toStr,
        });
        setFromDateValue(fromStr);
        setToDateValue(toStr);
      },
      last30: () => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 30);
        const fromStr = formatDateForInput(start);
        const toStr = formatDateForInput(end);
        updateParams({
          from: fromStr,
          to: toStr,
        });
        setFromDateValue(fromStr);
        setToDateValue(toStr);
      },
    }),
    [updateParams]
  );

  const removeFilter = useCallback(
    (key: string) => updateParams({ [key]: undefined }),
    [updateParams]
  );

  const clearAllFilters = useCallback(() => {
    setFromDateValue("");
    setToDateValue("");
    router.push("/dashboard/admin/audit");
  }, [router]);

  // Keep local date input state in sync with URL search params.
  useEffect(() => {
    if (fromDateParam !== fromDateValue) {
      setFromDateValue(fromDateParam);
    }
    if (toDateParam !== toDateValue) {
      setToDateValue(toDateParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDateParam, toDateParam]);

  const filteredEntries = useMemo(() => {
    if (!fromDateParam && !toDateParam) return entries;

    const fromBound = fromDateParam
      ? new Date(`${fromDateParam}T00:00:00.000Z`)
      : null;
    const toBound = toDateParam
      ? new Date(`${toDateParam}T23:59:59.999Z`)
      : null;

    return entries.filter((entry) => {
      const ts = entry.createdAt instanceof Date
        ? entry.createdAt
        : new Date(entry.createdAt as unknown as string);
      if (fromBound && ts < fromBound) return false;
      if (toBound && ts > toBound) return false;
      return true;
    });
  }, [entries, fromDateParam, toDateParam]);

  // Keep local entries in sync if the server sent new data via navigation.
  useEffect(() => {
    setEntries(initialData.entries);
  }, [initialData.entries]);

  // Live updates via SSE on first page, reusing the obsolete branch's pattern.
  useEffect(() => {
    if (currentPage !== 1) return;

    const es = new EventSource("/api/admin/audit/events");

    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "audit-log-created" || !payload.log) return;

        const log = payload.log as {
          id: string;
          createdAt: string;
          action: string;
          resourceType?: string | null;
          resourceId?: string | null;
          ipAddress?: string | null;
          userAgent?: string | null;
          context?: unknown;
          user?: {
            id: string;
            email: string;
            name: string | null;
          } | null;
        };

        // Apply current filters client-side so we only inject relevant rows.
        if (actionParam && log.action !== actionParam) return;
        if (resourceTypeParam && log.resourceType !== resourceTypeParam) return;

        if (fromDateParam) {
          const fromDate = new Date(fromDateParam);
          if (new Date(log.createdAt) < fromDate) return;
        }
        if (toDateParam) {
          const toDate = new Date(toDateParam);
          const logDate = new Date(log.createdAt);
          // Include the full "to" day by normalizing to end-of-day.
          toDate.setHours(23, 59, 59, 999);
          if (logDate > toDate) return;
        }

        if (searchParam) {
          const term = searchParam.toLowerCase();
          const haystack = [
            log.action,
            log.resourceType ?? "",
            log.resourceId ?? "",
            log.ipAddress ?? "",
            log.userAgent ?? "",
            log.user?.email ?? "",
            log.user?.name ?? "",
            JSON.stringify(log.context ?? {}),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(term)) return;
        }

        const entry: AuditLogEntry = {
          id: log.id,
          userId: log.user?.id ?? null,
          action: log.action,
          resourceType: log.resourceType ?? null,
          resourceId: log.resourceId ?? null,
          context: log.context ?? null,
          ipAddress: log.ipAddress ?? null,
          userAgent: log.userAgent ?? null,
          createdAt: new Date(log.createdAt),
          user: log.user ?? null,
        };

        setEntries((current) => {
          if (current.some((e) => e.id === entry.id)) {
            return current;
          }
          // Prepend new entry and keep list bounded to current page size.
          return [entry, ...current].slice(0, limit);
        });
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [
    actionParam,
    searchParam,
    resourceTypeParam,
    fromDateParam,
    toDateParam,
    currentPage,
    limit,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Audit log
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Who did what, when. Filter and export below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
                loading={exporting === "csv"}
                onClick={() => handleExport("csv")}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
                loading={exporting === "json"}
                onClick={() => handleExport("json")}
              >
                Export JSON
              </Button>
            </>
          )}
          <Link
            href="/dashboard/admin"
            className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
          >
            Back to Admin
          </Link>
        </div>
      </div>

      {/* Audit log list card: menu bar + table (same pattern as other admin overview pages) */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {/* Menu bar: search and filters on the page only (not global search) */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              label="Search"
              placeholder="Search by user email or name..."
              value={searchParam}
              onChange={(e) => updateParams({ search: e.target.value })}
            />
            <Select
              id="audit-filter-action"
              label="Action"
              options={actionSelectOptions}
              value={actionParam}
              onChange={(e) => updateParams({ action: e.target.value || undefined })}
              className="!mb-0"
            />
            <Select
              id="audit-filter-resource"
              label="Resource type"
              options={RESOURCE_TYPE_OPTIONS}
              value={resourceTypeParam}
              onChange={(e) =>
                updateParams({
                  resourceType: e.target.value || undefined,
                })
              }
              className="!mb-0"
            />
            <Input
              id="audit-filter-from"
              label="From"
              type="date"
              value={fromDateValue}
              onChange={(e) =>
                updateParams({ from: e.target.value || undefined })
              }
              className="!mb-0"
            />
            <Input
              id="audit-filter-to"
              label="To"
              type="date"
              value={toDateValue}
              onChange={(e) =>
                updateParams({ to: e.target.value || undefined })
              }
              className="!mb-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Quick range:
            </span>
            <Button variant="ghost" size="sm" onClick={quickRanges.today}>
              Today
            </Button>
            <Button variant="ghost" size="sm" onClick={quickRanges.last7}>
              Last 7 days
            </Button>
            <Button variant="ghost" size="sm" onClick={quickRanges.last30}>
              Last 30 days
            </Button>
          </div>
        </div>

        {/* Active filters summary */}
        {hasAnyFilter && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            {searchParam && (
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-300">
                Search: {searchParam}
                <button
                  type="button"
                  onClick={() => removeFilter("search")}
                  className="hover:text-neutral-900 dark:hover:text-neutral-100"
                  aria-label="Remove search filter"
                >
                  ×
                </button>
              </span>
            )}
            {actionParam && (
              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-300">
                Action: {actionParam}
                <button
                  type="button"
                  onClick={() => removeFilter("action")}
                  className="hover:text-neutral-900 dark:hover:text-neutral-100"
                  aria-label="Remove action filter"
                >
                  ×
                </button>
              </span>
            )}
            {resourceTypeParam && (
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-300">
              Resource: {resourceTypeParam}
              <button
                type="button"
                onClick={() => removeFilter("resourceType")}
                className="hover:text-neutral-900 dark:hover:text-neutral-100"
                aria-label="Remove resource type filter"
              >
                ×
              </button>
            </span>
          )}
          {fromDateParam && (
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-300">
              From: {fromDateParam}
              <button
                type="button"
                onClick={() => removeFilter("from")}
                className="hover:text-neutral-900 dark:hover:text-neutral-100"
                aria-label="Remove from date"
              >
                ×
              </button>
            </span>
          )}
          {toDateParam && (
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-sm text-neutral-700 dark:text-neutral-300">
              To: {toDateParam}
              <button
                type="button"
                onClick={() => removeFilter("to")}
                className="hover:text-neutral-900 dark:hover:text-neutral-100"
                aria-label="Remove to date"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
          >
            Clear filters
          </button>
        </div>
        )}

        {/* Table with resizable columns */}
        <div className="overflow-x-auto">
          <table
            ref={tableRef}
            className="text-sm text-left table-fixed w-full"
            style={{ minWidth: COLUMN_KEYS.reduce((sum, k) => sum + (columnWidths[k] ?? DEFAULT_COLUMN_WIDTHS[k]), 0) }}
          >
            <colgroup>
              {COLUMN_KEYS.map((key) => (
                <col
                  key={key}
                  ref={(el) => {
                    colRefs.current[key] = el;
                  }}
                  style={{
                    width: columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key],
                    minWidth: MIN_COLUMN_WIDTH,
                  }}
                />
              ))}
            </colgroup>
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300">
              <tr>
                <th className="px-4 py-3 font-medium relative group">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline focus:outline-none focus:underline"
                    onClick={() =>
                      updateParams({
                        sortOrder: sortOrderParam === "desc" ? "asc" : "desc",
                      })
                    }
                  >
                    Time
                    {sortOrderParam === "asc" ? " ↑" : " ↓"}
                  </button>
                  <div
                    role="separator"
                    aria-label="Resize Time column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("time", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
                <th className="px-4 py-3 font-medium relative group">
                  Action
                  <div
                    role="separator"
                    aria-label="Resize Action column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("action", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
                <th className="px-4 py-3 font-medium relative group">
                  User
                  <div
                    role="separator"
                    aria-label="Resize User column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("user", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
                <th className="px-4 py-3 font-medium relative group">
                  Resource
                  <div
                    role="separator"
                    aria-label="Resize Resource column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("resource", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell relative group">
                  IP
                  <div
                    role="separator"
                    aria-label="Resize IP column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("ip", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
                <th className="px-4 py-3 font-medium relative group">
                  Context
                  <div
                    role="separator"
                    aria-label="Resize Context column"
                    className="absolute top-0 right-0 w-2 h-full cursor-col-resize touch-none shrink-0 flex items-stretch justify-center hover:bg-primary-300/30 dark:hover:bg-primary-600/30 active:bg-primary-500/40 dark:active:bg-primary-500/40 group-hover:bg-primary-200/30 dark:group-hover:bg-primary-700/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startResize("context", e.clientX);
                    }}
                  >
                    <span className="w-px h-full bg-neutral-300/80 dark:bg-neutral-600/80" aria-hidden />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-neutral-500 dark:text-neutral-400"
                  >
                    <p className="font-medium">No audit entries match your filters.</p>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-4 py-3 min-w-0 overflow-hidden" title={formatDateTimeFull(entry.createdAt)}>
                      <span className="block truncate">{formatDateTimeFull(entry.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 min-w-0 overflow-hidden" title={entry.action}>
                      <span className="font-mono text-xs mr-2 truncate inline-block max-w-full align-middle">
                        {entry.action}
                      </span>
                      {getActionCategory(entry.action) && (
                        <Badge variant="default" size="sm" className="align-middle">
                          {getActionCategory(entry.action)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-0 overflow-hidden" title={entry.user ? (entry.user.name || entry.user.email) : undefined}>
                      {entry.user ? (
                        <Link
                          href={`/dashboard/admin/users/${entry.user.id}`}
                          className="block truncate text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline font-medium"
                        >
                          {entry.user.name || entry.user.email}
                        </Link>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-0 overflow-hidden" title={entry.resourceType && entry.resourceId ? `${entry.resourceType} / ${entry.resourceId}` : undefined}>
                      {entry.resourceType || entry.resourceId ? (
                        <span className="block truncate">
                          {entry.resourceType === "link" &&
                          entry.resourceId &&
                          entry.resourceId.length > 0 ? (
                            <Link
                              href={`/dashboard/links/${entry.resourceId}`}
                              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline font-medium"
                            >
                              link / {entry.resourceId}
                            </Link>
                          ) : entry.resourceType === "collection" &&
                            entry.resourceId &&
                            entry.resourceId.length > 0 ? (
                            <Link
                              href={`/dashboard/links/collections/${entry.resourceId}`}
                              className="text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 hover:underline font-medium"
                            >
                              collection / {entry.resourceId}
                            </Link>
                          ) : (
                            <>
                              {entry.resourceType}
                              {entry.resourceId && (
                                <span className="text-neutral-500">
                                  {" "}
                                  / {entry.resourceId}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500 hidden sm:table-cell min-w-0 overflow-hidden" title={entry.ipAddress || undefined}>
                      <span className="block truncate">{entry.ipAddress || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right min-w-0">
                      {(entry.context != null &&
                        typeof entry.context === "object") ||
                      entry.userAgent ? (
                        <Button
                          variant="primary"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => setDetailEntry(entry)}
                        >
                          View details
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {total === 0 ? 0 : from}–{to} of {total} entries
          </p>
          <div className="flex items-center gap-2">
            <label
              htmlFor="audit-page-size"
              className="text-sm text-neutral-600 dark:text-neutral-400"
            >
              Page size:
            </label>
            <select
              id="audit-page-size"
              value={limitParam}
              onChange={(e) =>
                updateParams({ limit: e.target.value, page: 1 })
              }
              className="rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2 py-1 text-sm"
            >
              {PAGE_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Page {currentPage} of {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => updateParams({ page: currentPage - 1 })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => updateParams({ page: currentPage + 1 })}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Context detail dialog */}
      <Dialog
        open={!!detailEntry}
        onOpenChange={(open) => !open && setDetailEntry(null)}
        title="Audit entry details"
        description={
          detailEntry
            ? `${detailEntry.action} at ${formatDateTimeFull(detailEntry.createdAt)}`
            : undefined
        }
      >
        {detailEntry && (
          <div className="px-4 sm:px-6 pb-6 space-y-4">
            {detailEntry.userAgent && (
              <div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  User agent
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 break-all">
                  {detailEntry.userAgent}
                </p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Context
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const str =
                      typeof detailEntry.context === "object"
                        ? JSON.stringify(detailEntry.context, null, 2)
                        : String(detailEntry.context);
                    void navigator.clipboard.writeText(str);
                  }}
                >
                  Copy JSON
                </Button>
              </div>
              <pre className="text-xs bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap break-words">
                {typeof detailEntry.context === "object"
                  ? JSON.stringify(detailEntry.context, null, 2)
                  : String(detailEntry.context ?? "—")}
              </pre>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
