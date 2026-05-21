import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import type { Ticket } from "@/lib/types";
import { relativeTime } from "@/lib/hooks/useApi";

// Human: Staff-only ticket table with status filtering and relative timestamps for triage outside the user portal.
// Agent: GET /tickets?status=; ROLE gate ADMIN|MODERATOR; STATE tickets,loading,statusFilter; USES relativeTime.

export default function AdminTicketsPage() {
  const { can } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ tickets: Ticket[] }>(`/tickets?status=${statusFilter}`);
      setTickets(data.tickets);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  if (!can("admin.tickets.manage")) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  const statusVariant = (s: string) => {
    if (s === "OPEN") return "info" as const;
    if (s === "IN_PROGRESS") return "warning" as const;
    if (s === "RESOLVED" || s === "CLOSED") return "success" as const;
    return "default" as const;
  };

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  const TicketsEmptyIcon = () => (
    <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Admin Tickets</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">All tickets across the system ({tickets.length})</p>
        </div>
      </div>

      <div className={CARD_CLASS + " overflow-hidden"}>
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto h-9 text-sm">
            <option value="ALL">All Statuses</option>
            <option value="UNRESOLVED">Unresolved</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <TicketsEmptyIcon />
            <p className="text-neutral-500 dark:text-neutral-400">No tickets found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Ticket</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Priority</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Created By</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Assigned To</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="p-3">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{t.title}</div>
                      <div className="text-xs text-neutral-500">{t.ticket_number}</div>
                    </td>
                    <td className="p-3"><Badge variant={statusVariant(t.status)} size="sm">{t.status.replace("_", " ")}</Badge></td>
                    <td className="p-3"><Badge size="sm">{t.priority}</Badge></td>
                    <td className="p-3 text-neutral-500">{t.created_by?.name || t.created_by?.email || "—"}</td>
                    <td className="p-3 text-neutral-500">{t.assigned_to?.name || t.assigned_to?.email || "Unassigned"}</td>
                    <td className="p-3 text-neutral-500">{relativeTime(t.updated_at)}</td>
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
