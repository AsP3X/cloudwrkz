import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import type { Module } from "@/lib/types";

// Human: Toggle board for enabling/disabling product modules and refreshing the signed-in user’s module claims.
// Agent: GET /admin/modules; PATCH toggles; CALLS refreshUser after changes; REQUIRES admin role gate in UI.

export default function ModulesPage() {
  const { user, refreshUser } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ modules: Module[] }>("/admin/modules");
      setModules(data.modules);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/admin/modules/${id}`, { enabled: !enabled });
      fetchModules();
      refreshUser();
    } catch { /* ignore */ }
  };

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  const ModulesEmptyIcon = () => (
    <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Modules</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">Enable or disable application modules</p>
        </div>
      </div>

      <div className={CARD_CLASS}>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : modules.length === 0 ? (
          <div className="p-12 text-center">
            <ModulesEmptyIcon />
            <p className="text-neutral-500 dark:text-neutral-400">No modules configured</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {modules.map((m) => (
              <div key={m.id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{m.name}</h3>
                    <Badge variant={m.enabled ? "success" : "default"} size="sm">{m.enabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                  {m.description && <p className="text-sm text-neutral-500 mt-0.5">{m.description}</p>}
                  <p className="text-xs text-neutral-400 mt-1">Key: {m.key}</p>
                </div>
                <button
                  onClick={() => handleToggle(m.id, m.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    m.enabled ? "bg-primary-600" : "bg-neutral-300 dark:bg-neutral-700"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${m.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
