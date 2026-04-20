// Human: Performance overview page aggregates goal and review statistics per employee.
// Managers can click through to a specific employee to add reviews or goals.
// Agent: CALLS GET /employees/performance-summary; READ-ONLY aggregate; links to /employees/:id.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { PerformanceSummary } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  ON_LEAVE:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  TERMINATED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  DRAFT:      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function EmployeePerformancePage() {
  const { can } = useAuth();
  const canView = can("modules.employees.view") || can("employees.performance.manage");
  const [summaries, setSummaries] = useState<PerformanceSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ summaries: PerformanceSummary[] }>("/employees/performance-summary");
      setSummaries(data.summaries ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to performance data." primaryHref={ROUTES.DASHBOARD} primaryLabel="Back to Dashboard" />;
  }

  const q = search.trim().toLowerCase();
  const filtered = summaries.filter((s) => {
    if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
    if (!q) return true;
    return (s.display_name + " " + (s.department ?? "") + " " + (s.job_title ?? "")).toLowerCase().includes(q);
  });

  const totalGoals   = summaries.reduce((sum, s) => sum + s.total_goals, 0);
  const activeGoals  = summaries.reduce((sum, s) => sum + s.active_goals, 0);
  const totalReviews = summaries.reduce((sum, s) => sum + s.total_reviews, 0);
  const noReviews    = summaries.filter((s) => s.total_reviews === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Performance</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Company-wide goal and review overview
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Total goals", value: totalGoals },
          { label: "Active goals", value: activeGoals },
          { label: "Total reviews", value: totalReviews },
          { label: "No reviews yet", value: noReviews },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_LEAVE">On leave</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-600 dark:border-red-900/40 dark:bg-neutral-900 dark:text-red-400">{error}</div>
      )}
      {!loading && !error && (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Active Goals</th>
                <th className="px-4 py-3 font-semibold text-center">Total Goals</th>
                <th className="px-4 py-3 font-semibold text-center">Reviews</th>
                <th className="px-4 py-3 font-semibold">Last Review</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{s.display_name}</p>
                    {s.job_title && <p className="text-xs text-neutral-500">{s.job_title}</p>}
                    {s.department && <p className="text-xs text-neutral-500">{s.department}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status] ?? STATUS_STYLE.DRAFT}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${s.active_goals > 0 ? "text-primary-600 dark:text-primary-400" : "text-neutral-400"}`}>
                      {s.active_goals}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-neutral-700 dark:text-neutral-300">{s.total_goals}</td>
                  <td className="px-4 py-3 text-center text-neutral-700 dark:text-neutral-300">{s.total_reviews}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{s.last_reviewed_at ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`${ROUTES.EMPLOYEES}/${s.id}`}
                      className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">No employees match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
