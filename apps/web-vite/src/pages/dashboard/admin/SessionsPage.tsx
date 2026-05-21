import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AdminSession } from "@/lib/types";
import { formatDateTime } from "@/lib/hooks/useApi";
import { PERM } from "@/lib/permissions";

// Human: Admin session inventory with search, revocation affordances, and metadata formatted for security reviews.
// Agent: GET /admin/sessions?search=; PERM admin.sessions.view + revoke; STATE sessions,loading,search; DISPLAYS via formatDateTime.

export default function SessionsPage() {
  const { can } = useAuth();
  const canRevokeSessions = can(PERM.ADMIN_SESSIONS_REVOKE);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/admin/sessions";
      if (search) url += `?search=${encodeURIComponent(search)}`;
      const data = await api.get<{ sessions: AdminSession[] }>(url);
      setSessions(data.sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this session?")) return;
    try {
      await api.delete(`/admin/sessions/${id}`);
      fetchSessions();
    } catch { /* ignore */ }
  };

  if (!can("admin.sessions.view")) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  const SessionsEmptyIcon = () => (
    <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Sessions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">{sessions.length} active sessions</p>
        </div>
      </div>

      <div className={CARD_CLASS + " overflow-hidden"}>
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by user name or email..." className="h-9 text-sm max-w-xs" />
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center">
            <SessionsEmptyIcon />
            <p className="text-neutral-500 dark:text-neutral-400">No active sessions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">User</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Device</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">IP</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Created</th>
                  <th className="text-left p-3 font-medium text-neutral-600 dark:text-neutral-400">Expires</th>
                  <th className="text-right p-3 font-medium text-neutral-600 dark:text-neutral-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="p-3">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{s.userName || "—"}</div>
                      <div className="text-xs text-neutral-500">{s.userEmail}</div>
                    </td>
                    <td className="p-3 text-neutral-600 dark:text-neutral-400">{s.deviceName || s.deviceType || "Unknown"}</td>
                    <td className="p-3 text-neutral-500 font-mono text-xs">{s.ipAddress || "—"}</td>
                    <td className="p-3 text-neutral-500">{formatDateTime(s.createdAt)}</td>
                    <td className="p-3 text-neutral-500">{formatDateTime(s.expiresAt)}</td>
                    <td className="p-3 text-right">
                      {canRevokeSessions && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(s.id)} className="text-error-600">Revoke</Button>
                      )}
                    </td>
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
