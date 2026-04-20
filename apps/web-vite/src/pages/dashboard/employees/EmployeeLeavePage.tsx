// Human: Leave management page shows all company leave requests with filters and lets
// managers create/approve/deny requests inline. Permission-gated actions.
// Agent: CALLS GET /employees/leave, GET /employees, POST /employees/:id/leave, PATCH /employees/:id/leave/:leave_id.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Employee, EmployeeLeaveRequest } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

const LEAVE_TYPES = ["VACATION", "SICK", "PERSONAL", "MATERNITY", "PATERNITY", "BEREAVEMENT", "UNPAID", "COMPENSATORY", "OTHER"] as const;
const LEAVE_STATUSES = ["PENDING", "APPROVED", "DENIED", "CANCELLED"] as const;

const STATUS_STYLE: Record<string, string> = {
  PENDING:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  DENIED:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  CANCELLED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function EmployeeLeavePage() {
  const { can } = useAuth();
  const canView    = can("employees.leave.view") || can("employees.leave.manage") || can("employees.leave.approve");
  const canCreate  = can("employees.leave.manage");
  const canApprove = can("employees.leave.approve");

  const [requests, setRequests] = useState<EmployeeLeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter]   = useState("ALL");
  const [typeFilter, setTypeFilter]       = useState("ALL");

  // New leave form
  const [showForm, setShowForm]           = useState(false);
  const [formEmployee, setFormEmployee]   = useState("");
  const [formType, setFormType]           = useState<string>("VACATION");
  const [formStart, setFormStart]         = useState("");
  const [formEnd, setFormEnd]             = useState("");
  const [formReason, setFormReason]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL")   params.set("leave_type", typeFilter);
      const [leaveData, empData] = await Promise.all([
        api.get<{ leave_requests: EmployeeLeaveRequest[] }>(`/employees/leave?${params.toString()}`),
        api.get<{ employees: Employee[] }>("/employees"),
      ]);
      setRequests(leaveData.leave_requests ?? []);
      setEmployees(empData.employees ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to leave management." primaryHref={ROUTES.DASHBOARD} primaryLabel="Back to Dashboard" />;
  }

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setSubmitting(key);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  };

  const submitNewLeave = (event: FormEvent) => {
    event.preventDefault();
    if (!formEmployee || !formStart || !formEnd) return;
    void runAction("create", () =>
      api.post(`/employees/${formEmployee}/leave`, {
        leave_type: formType,
        start_date: formStart,
        end_date: formEnd,
        reason: formReason || null,
      })
    ).then(() => { setShowForm(false); setFormEmployee(""); setFormReason(""); setFormStart(""); setFormEnd(""); });
  };

  const inputClass = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Leave Management</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            Vacation, sick leave, parental leave and absences
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Request leave"}
          </Button>
        )}
      </div>

      {showForm && canCreate && (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">New leave request</h2>
          <form onSubmit={submitNewLeave} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Employee
                <select className={`mt-1 ${inputClass}`} value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)} required>
                  <option value="">Select employee…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.display_name ?? `${emp.first_name} ${emp.last_name}`} ({emp.employee_code})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Leave type
              <select className={`mt-1 ${inputClass}`} value={formType} onChange={(e) => setFormType(e.target.value)}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Start date
              <input type="date" className={`mt-1 ${inputClass}`} value={formStart} onChange={(e) => setFormStart(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              End date
              <input type="date" className={`mt-1 ${inputClass}`} value={formEnd} onChange={(e) => setFormEnd(e.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 md:col-span-2">
              Reason (optional)
              <input className={`mt-1 ${inputClass}`} value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="Reason for leave" />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting === "create"}>
                {submitting === "create" ? "Creating…" : "Submit request"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          {LEAVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="ALL">All leave types</option>
          {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-500 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          No leave requests found.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">From</th>
                <th className="px-4 py-3 font-semibold">To</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                {canApprove && <th className="px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{req.employee_name ?? req.employee_id}</p>
                    {req.department && <p className="text-xs text-neutral-500">{req.department}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{req.leave_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{req.start_date}</td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{req.end_date}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[req.status] ?? STATUS_STYLE.CANCELLED}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{req.reason ?? "—"}</td>
                  {canApprove && (
                    <td className="px-4 py-3">
                      {req.status === "PENDING" && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            disabled={submitting === `approve-${req.id}`}
                            onClick={() => void runAction(`approve-${req.id}`, () =>
                              api.patch(`/employees/${req.employee_id}/leave/${req.id}`, { status: "APPROVED" })
                            )}
                          >
                            {submitting === `approve-${req.id}` ? "…" : "Approve"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={submitting === `deny-${req.id}`}
                            onClick={() => {
                              const reason = window.prompt("Reason for denial (optional):");
                              void runAction(`deny-${req.id}`, () =>
                                api.patch(`/employees/${req.employee_id}/leave/${req.id}`, {
                                  status: "DENIED",
                                  rejection_reason: reason ?? undefined,
                                })
                              );
                            }}
                          >
                            {submitting === `deny-${req.id}` ? "…" : "Deny"}
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
