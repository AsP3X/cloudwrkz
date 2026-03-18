import { useState, useEffect } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<Record<string, number>>("/admin/statistics");
        setStats(data);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const handlePurge = async () => {
    if (!confirm("Purge all deleted accounts older than 30 days?")) return;
    setPurging(true);
    try {
      const data = await api.post<{ message: string }>("/admin/purge-deleted-accounts");
      setPurgeResult(data.message);
    } catch (err) {
      setPurgeResult(err instanceof Error ? err.message : "Purge failed");
    }
    setPurging(false);
  };

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">System Settings</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">System configuration and maintenance</p>
        </div>
      </div>

      {loading ? (
        <div className={CARD_CLASS + " p-12 text-center"}><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
      ) : stats && (
        <div className={CARD_CLASS + " p-6"}>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">System Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                <h3 className="text-sm text-neutral-500">{key.replace(/([A-Z])/g, " $1").trim()}</h3>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={CARD_CLASS + " p-6"}>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Maintenance</h2>
        <div className="p-4 bg-error-50 dark:bg-error-950/50 rounded-lg border border-error-200 dark:border-error-800">
          <h3 className="font-medium text-error-700 dark:text-error-300 mb-1">Purge Deleted Accounts</h3>
          <p className="text-sm text-error-600 dark:text-error-400 mb-3">
            Permanently remove accounts marked as deleted over 30 days ago.
          </p>
          <Button variant="danger" onClick={handlePurge} loading={purging}>Purge Deleted Accounts</Button>
          {purgeResult && <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">{purgeResult}</p>}
        </div>
      </div>
    </div>
  );
}
