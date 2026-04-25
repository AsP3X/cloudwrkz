import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import type { AuditEntry, AuditEntriesResponse } from "@/lib/types";
import { formatDateTime } from "@/lib/hooks/useApi";

const PAGE_LIMIT = 50;

// Human: Searchable audit log explorer with filters, CSV export, and permission-aware data access for compliance.
// Agent: FETCH /admin/audit*; QUERY action,user,date range,sort; REQUIRES audit.view|audit.export; PAGE_LIMIT paging.

export default function AuditPage() {
  const { user, can } = useAuth();
  const [data, setData] = useState<AuditEntriesResponse | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setActionsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [exporting, setExporting] = useState(false);

  const canViewAudit = can("audit.view");
  const canExportAudit = can("audit.export");

  const fetchEntries = useCallback(async () => {
    if (!canViewAudit) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_LIMIT));
      params.set("sort_order", sortOrder);
      if (actionFilter) params.set("action", actionFilter);
      if (userSearch.trim()) params.set("user_search", userSearch.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await api.get<AuditEntriesResponse>(`/admin/audit/entries?${params.toString()}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canViewAudit, page, sortOrder, actionFilter, userSearch, fromDate, toDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const fetchActions = useCallback(async () => {
    if (!canViewAudit) return;
    setActionsLoading(true);
    try {
      const res = await api.get<{ actions: string[] }>("/admin/audit/actions");
      setActions(res.actions ?? []);
    } catch {
      setActions([]);
    } finally {
      setActionsLoading(false);
    }
  }, [canViewAudit]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleExport = useCallback(async (format: "json" | "csv") => {
    if (!canExportAudit) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (actionFilter) params.set("action", actionFilter);
      if (userSearch.trim()) params.set("user_search", userSearch.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await api.get<{ format: string; entries: AuditEntry[]; filename: string }>(
        `/admin/audit/export?${params.toString()}`
      );
      const blob = format === "csv" ? exportAsCsv(res.entries) : new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      const filename = `${res.filename || "audit-log"}.${format}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }, [canExportAudit, actionFilter, userSearch, fromDate, toDate]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Please sign in.</p>
      </div>
    );
  }

  if (!canViewAudit && user.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied. View audit log permission required.</p>
      </div>
    );
  }

  const actionVariant = (a: string) => {
    if (a.includes("create") || a.includes("register")) return "success" as const;
    if (a.includes("delete") || a.includes("ban")) return "error" as const;
    if (a.includes("update") || a.includes("change") || a.includes("revoke") || a.includes("grant")) return "warning" as const;
    if (a.includes("login")) return "info" as const;
    return "default" as const;
  };

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const AuditEmptyIcon = () => (
    <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Audit Log</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">System activity log</p>
        </div>
        {canExportAudit && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExport("json")}
              disabled={exporting}
              className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={`${CARD_CLASS} p-4`}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Action</span>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">User (search)</span>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              onBlur={() => setPage(1)}
              placeholder="Email or name"
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm w-48"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Sort</span>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value as "desc" | "asc"); setPage(1); }}
              className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 text-sm"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setPage(1); fetchEntries(); }}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Apply
          </button>
        </div>
      </div>

      <div className={`${CARD_CLASS} overflow-hidden`}>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <AuditEmptyIcon />
            <p className="text-neutral-500 dark:text-neutral-400">No audit events</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                    <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Time</th>
                    <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Action</th>
                    <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Resource</th>
                    <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">User</th>
                    <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="p-3 text-neutral-500 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                      <td className="p-3"><Badge variant={actionVariant(e.action)} size="sm">{e.action}</Badge></td>
                      <td className="p-3 text-neutral-600 dark:text-neutral-400">
                        {e.resource_type && <span>{e.resource_type}</span>}
                        {e.resource_id && <span className="text-xs text-neutral-400 ml-1">({e.resource_id.slice(0, 8)}...)</span>}
                      </td>
                      <td className="p-3 text-neutral-600 dark:text-neutral-400">
                        {e.user ? (
                          <span title={e.user.email}>{e.user.name || e.user.email}</span>
                        ) : (
                          <span className="text-neutral-500 font-mono text-xs">{e.user_id ? `${e.user_id.slice(0, 8)}...` : "System"}</span>
                        )}
                      </td>
                      <td className="p-3 text-neutral-500 font-mono text-xs">{e.ip_address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-200 dark:border-neutral-800">
                <p className="text-sm text-neutral-500">
                  Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function exportAsCsv(entries: AuditEntry[]): Blob {
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = "timestamp,action,userId,userEmail,userName,resourceType,resourceId,ipAddress,userAgent,contextJSON";
  const rows = entries.map((e) =>
    [
      e.created_at,
      e.action,
      e.user_id ?? "",
      e.user?.email ?? "",
      e.user?.name ?? "",
      e.resource_type ?? "",
      e.resource_id ?? "",
      e.ip_address ?? "",
      e.user_agent ?? "",
      e.context != null ? JSON.stringify(e.context) : "",
    ].map(escape).join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}
