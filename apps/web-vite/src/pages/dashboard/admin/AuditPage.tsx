import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import type { AuditEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/hooks/useApi";

export default function AuditPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ events: AuditEvent[] }>("/admin/audit/events");
      setEvents(data.events);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  const actionVariant = (a: string) => {
    if (a.includes("create") || a.includes("register")) return "success" as const;
    if (a.includes("delete") || a.includes("ban")) return "error" as const;
    if (a.includes("update") || a.includes("change")) return "warning" as const;
    if (a.includes("login")) return "info" as const;
    return "default" as const;
  };

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

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
      </div>

      <div className={CARD_CLASS + " overflow-hidden"}>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center">
            <AuditEmptyIcon />
            <p className="text-neutral-500 dark:text-neutral-400">No audit events</p>
          </div>
        ) : (
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
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="p-3 text-neutral-500 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="p-3"><Badge variant={actionVariant(e.action)} size="sm">{e.action}</Badge></td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400">
                      {e.resource_type && <span>{e.resource_type}</span>}
                      {e.resource_id && <span className="text-xs text-neutral-400 ml-1">({e.resource_id.slice(0, 8)}...)</span>}
                    </td>
                    <td className="p-3 text-neutral-500 font-mono text-xs">{e.user_id ? e.user_id.slice(0, 8) + "..." : "System"}</td>
                    <td className="p-3 text-neutral-500 font-mono text-xs">{e.ip_address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
