// Human: Clean employee profile page with tab-based navigation across profile sections.
// Each tab shows the relevant data and mutation forms. All actions are permission-gated.
// Agent: CALLS GET /employees/:id; uses child tabs to show sub-resources inline.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Employee, EmployeeLeaveRequest, EmployeeDocument } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

type Tab = "profile" | "compensation" | "vacation" | "leave" | "assets" | "skills" | "performance" | "documents" | "lifecycle";

interface EmployeeDetail {
  id: string;
  employee_code: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  work_email: string | null;
  personal_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  hire_date: string;
  termination_date: string | null;
  status: string;
  employment_type: string;
  department: string | null;
  job_title: string | null;
  legal_entity: string | null;
  location: string | null;
  manager_employee_id: string | null;
  notes: string | null;
  payroll_external_id: string | null;
  created_at: string;
  updated_at: string;
  compensation: CompRecord[];
  assets: AssetRecord[];
  skills: SkillRecord[];
  certifications: CertRecord[];
  performance_reviews: ReviewRecord[];
  goals: GoalRecord[];
  lifecycle_events: LifecycleRecord[];
}

interface EmployeeDetailApiResponse {
  employee: Omit<
    EmployeeDetail,
    | "compensation"
    | "assets"
    | "skills"
    | "certifications"
    | "performance_reviews"
    | "goals"
    | "lifecycle_events"
  >;
  compensation?: CompRecord[];
  assets?: AssetRecord[];
  skills?: SkillRecord[];
  certifications?: CertRecord[];
  performance_reviews?: ReviewRecord[];
  goals?: GoalRecord[];
  lifecycle_events?: LifecycleRecord[];
}

interface CompRecord { id: string; pay_frequency: string; amount_cents: number; currency: string; compensation_type: string; effective_from: string; effective_to: string | null; is_current: boolean; }
interface AssetRecord { id: string; asset_name: string; asset_tag: string | null; category: string | null; status: string; assigned_at: string; }
interface SkillRecord { id: string; skill_name: string; level: number | null; category: string | null; verified: boolean; }
interface CertRecord { id: string; certification_name: string; issuer: string | null; issued_at: string | null; expires_at: string | null; status: string; }
interface ReviewRecord { id: string; cycle_name: string; rating: number | null; summary: string | null; reviewed_at: string | null; }
interface GoalRecord { id: string; title: string; status: string; progress_percent: number; target_date: string | null; }
interface LifecycleRecord { id: string; event_type: string; status: string; title: string; due_at: string | null; }

interface CwUser {
  id: string;
  name: string | null;
  email: string;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  ON_LEAVE:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  TERMINATED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  DRAFT:      "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  APPROVED:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  DENIED:     "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  PENDING:    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  CANCELLED:  "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  ASSIGNED:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  RETURNED:   "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

const PAY_FREQS = ["HOURLY", "WEEKLY", "BIWEEKLY", "MONTHLY", "ANNUAL"] as const;
const LEAVE_TYPES = ["VACATION", "SICK", "PERSONAL", "MATERNITY", "PATERNITY", "BEREAVEMENT", "UNPAID", "COMPENSATORY", "OTHER"] as const;

function Badge({ status }: { status?: string | null }) {
  const safeStatus = (status ?? "UNKNOWN").toString();
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[safeStatus] ?? STATUS_STYLE.DRAFT}`}>
      {safeStatus.replace(/_/g, " ")}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <dt className="w-36 shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400 pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-neutral-900 dark:text-neutral-100">{value ?? "—"}</dd>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {message}
    </p>
  );
}

const inputClass = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-primary-500";

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, user: authUser } = useAuth();

  const canView        = can("employees.view") || can("employees.view_all");
  const canUpdate      = can("employees.update");
  const canDelete      = can("employees.delete");
  const canComp        = can("employees.compensation.manage");
  const canAssets      = can("employees.assets.manage");
  const canPerf        = can("employees.performance.manage");
  const canLeaveManage = can("employees.leave.manage");
  const canLeaveApprove= can("employees.leave.approve");
  const canDocs        = can("employees.documents.manage");

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("profile");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);

  // Leave tab state
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [cwUsers, setCwUsers] = useState<CwUser[]>([]);

  // Leave tab state
  const [leaveRequests, setLeaveRequests] = useState<EmployeeLeaveRequest[]>([]);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveType, setLeaveType]   = useState("VACATION");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd]     = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Docs tab state
  const [documents, setDocuments]   = useState<EmployeeDocument[]>([]);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docType, setDocType]   = useState("GENERAL");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl]     = useState("");
  const [docExpires, setDocExpires] = useState("");

  const loadEmployee = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<EmployeeDetailApiResponse>(`/employees/${id}`);
      if (!data?.employee) {
        setError("Employee payload missing");
        setEmployee(null);
        return;
      }
      setEmployee({
        ...data.employee,
        compensation: data.compensation ?? [],
        assets: data.assets ?? [],
        skills: data.skills ?? [],
        certifications: data.certifications ?? [],
        performance_reviews: data.performance_reviews ?? [],
        goals: data.goals ?? [],
        lifecycle_events: data.lifecycle_events ?? [],
      });
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAllEmployees = useCallback(async () => {
    try {
      const data = await api.get<{ employees: Employee[] }>("/employees");
      setAllEmployees(data.employees ?? []);
    } catch { /* non-fatal */ }
  }, []);

  const loadCwUsers = useCallback(async () => {
    try {
      const data = await api.get<{ users: CwUser[] }>("/users");
      setCwUsers(data.users ?? []);
    } catch { /* non-fatal */ }
  }, []);

  const loadLeave = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ leave_requests: EmployeeLeaveRequest[] }>(`/employees/${id}/leave`);
      setLeaveRequests(data.leave_requests ?? []);
    } catch { setLeaveRequests([]); }
  }, [id]);

  const loadDocs = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ documents: EmployeeDocument[] }>(`/employees/${id}/documents`);
      setDocuments(data.documents ?? []);
    } catch { setDocuments([]); }
  }, [id]);

  useEffect(() => {
    void loadEmployee();
    void loadAllEmployees();
    void loadCwUsers();
  }, [loadEmployee, loadAllEmployees, loadCwUsers]);
  useEffect(() => { if (tab === "leave" || tab === "vacation") void loadLeave(); }, [tab, loadLeave]);
  useEffect(() => { if (tab === "documents") void loadDocs(); }, [tab, loadDocs]);

  const run = useCallback(async (key: string, action: () => Promise<unknown>, onDone?: () => void) => {
    setSubmitting(key);
    setFormError(null);
    try {
      await action();
      await loadEmployee();
      onDone?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  }, [loadEmployee]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to employee records." primaryHref={ROUTES.EMPLOYEES} primaryLabel="Back to Directory" />;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>
  );

  if (error || !employee) return (
    <div className="rounded-xl border border-red-200 bg-white p-8 text-center dark:border-red-900/40 dark:bg-neutral-900">
      <p className="text-red-600 dark:text-red-400">{error ?? "Employee not found."}</p>
      <Link to={ROUTES.EMPLOYEES} className="mt-3 block text-sm text-primary-600 hover:underline dark:text-primary-400">← Back to directory</Link>
    </div>
  );

  const firstName = employee.first_name?.trim() ?? "";
  const lastName = employee.last_name?.trim() ?? "";
  const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim() || employee.employee_code || "Unknown Employee";
  const name = employee.display_name?.trim() || fallbackName;
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() ||
    name.charAt(0).toUpperCase() ||
    "?";

  // Resolve superior (manager) display label from loaded employees list
  const managerEmployee = employee.manager_employee_id
    ? allEmployees.find((e) => e.id === employee.manager_employee_id) ?? null
    : null;
  const managerLabel = managerEmployee
    ? `${managerEmployee.employee_code} – ${managerEmployee.display_name ?? `${managerEmployee.first_name} ${managerEmployee.last_name}`.trim()}`
    : employee.manager_employee_id
      ? employee.manager_employee_id  // fallback: show raw ID while employees load
      : null;

  const linkedCwUser = employee.user_id
    ? cwUsers.find((u) => u.id === employee.user_id) ?? null
    : null;
  const linkedUserLabel = linkedCwUser
    ? [linkedCwUser.name?.trim() || null, linkedCwUser.email].filter(Boolean).join(" · ")
    : employee.user_id
      ? employee.user_id
      : null;

  const linkedUserHref = employee.user_id
    ? can("admin.users.view")
      ? `${ROUTES.ADMIN_USERS}/${employee.user_id}`
      : authUser?.role === "ADMIN" || authUser?.id === employee.user_id
        ? `${ROUTES.DASHBOARD}/users/${employee.user_id}`
        : `${ROUTES.EMPLOYEES}/${employee.id}/edit`
    : "";

  const TABS: { key: Tab; label: string }[] = [
    { key: "profile",      label: "Profile" },
    { key: "compensation", label: "Compensation" },
    { key: "vacation",     label: "Vacation" },
    { key: "leave",        label: "Leave" },
    { key: "assets",       label: "Assets" },
    { key: "skills",       label: "Skills & Certs" },
    { key: "performance",  label: "Performance" },
    { key: "documents",    label: "Documents" },
    { key: "lifecycle",    label: "Lifecycle" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{name}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {employee.employee_code}
              {employee.job_title ? ` · ${employee.job_title}` : ""}
              {employee.department ? ` · ${employee.department}` : ""}
            </p>
          </div>
          <Badge status={employee.status} />
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <Button asChild variant="outline" type="button">
              <Link to={`${ROUTES.EMPLOYEES}/${employee.id}/edit`}>Edit</Link>
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="outline"
              disabled={submitting === "delete"}
              onClick={() => {
                if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
                void run("delete", () => api.delete(`/employees/${employee.id}`)).then(() => navigate(ROUTES.EMPLOYEES));
              }}
            >
              {submitting === "delete" ? "Deleting…" : "Delete"}
            </Button>
          )}
          <Button asChild variant="outline" type="button">
            <Link to={ROUTES.EMPLOYEES}>← Directory</Link>
          </Button>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-300">
          {formError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">Identity</h2>
            <dl>
              <Row label="Employee code" value={employee.employee_code} />
              <Row label="Full name" value={fallbackName} />
              <Row label="Display name" value={employee.display_name} />
              <Row label="Date of birth" value={employee.date_of_birth} />
              <div className="flex items-start gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                <dt className="w-36 shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400 pt-1.5">
                  Linked cloudwrkz user
                </dt>
                <dd className="min-w-0 flex-1">
                  {employee.user_id ? (
                    <Button asChild variant="outline" size="sm" className="h-auto max-w-full justify-start py-1.5 font-normal">
                      <Link to={linkedUserHref} title="Open linked cloudwrkz account">
                        <span
                          className={
                            "truncate text-left " +
                            (linkedCwUser ? "" : "font-mono text-xs")
                          }
                        >
                          {linkedUserLabel}
                        </span>
                      </Link>
                    </Button>
                  ) : canUpdate ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`${ROUTES.EMPLOYEES}/${employee.id}/edit`}>Link a cloudwrkz user…</Link>
                    </Button>
                  ) : (
                    <span className="text-sm text-neutral-900 dark:text-neutral-100">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">Contact</h2>
            <dl>
              <Row label="Work email" value={employee.work_email} />
              <Row label="Personal email" value={employee.personal_email} />
              <Row label="Phone" value={employee.phone} />
            </dl>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">Employment</h2>
            <dl>
              <Row label="Status" value={employee.status} />
              <Row label="Type" value={employee.employment_type} />
              <Row label="Hire date" value={employee.hire_date} />
              <Row label="Termination" value={employee.termination_date} />
              <Row label="Legal entity" value={employee.legal_entity} />
              <Row label="Payroll ID" value={employee.payroll_external_id} />
            </dl>
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">Position</h2>
            <dl>
              <Row label="Department" value={employee.department} />
              <Row label="Job title" value={employee.job_title} />
              <Row label="Location" value={employee.location} />
              <Row label="Superior" value={managerLabel} />
            </dl>
          </section>
          {employee.notes && (
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
              <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">Notes</h2>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{employee.notes}</p>
            </section>
          )}
        </div>
      )}

      {/* Compensation tab */}
      {tab === "compensation" && (
        <div className="space-y-4">
          {employee.compensation.length === 0
            ? <EmptyState message="No compensation records." />
            : employee.compensation.map((c) => (
              <div key={c.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {c.currency} {(c.amount_cents / 100).toLocaleString()} <span className="text-sm font-normal text-neutral-500">/ {c.pay_frequency.toLowerCase()}</span>
                  </p>
                  <p className="text-xs text-neutral-500">{c.compensation_type} · From {c.effective_from}{c.effective_to ? ` to ${c.effective_to}` : ""}</p>
                </div>
                {c.is_current && <Badge status="ACTIVE" />}
              </div>
            ))
          }
          {canComp && (
            <CompForm employeeId={employee.id} onSaved={loadEmployee} submitting={submitting} setError={setFormError} run={run} />
          )}
        </div>
      )}

      {/* Vacation tab */}
      {tab === "vacation" && (
        <VacationTab
          employeeId={employee.id}
          leaveRequests={leaveRequests}
          canCreate={canLeaveManage}
          canApprove={canLeaveApprove}
          submitting={submitting}
          run={run}
          loadLeave={loadLeave}
        />
      )}

      {/* Leave tab */}
      {tab === "leave" && (
        <div className="space-y-4">
          {(canLeaveManage || canLeaveApprove) && (
            <div className="flex justify-end">
              {canLeaveManage && <Button onClick={() => setShowLeaveForm(!showLeaveForm)}>{showLeaveForm ? "Cancel" : "Request leave"}</Button>}
            </div>
          )}
          {showLeaveForm && canLeaveManage && (
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                await run("leave-create", () => api.post(`/employees/${employee.id}/leave`, {
                  leave_type: leaveType, start_date: leaveStart, end_date: leaveEnd, reason: leaveReason || null,
                }), () => { setShowLeaveForm(false); setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); void loadLeave(); });
              }}
              className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3 className="col-span-2 font-semibold text-neutral-900 dark:text-neutral-100">New leave request</h3>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Leave type
                <select className={`mt-1 ${inputClass}`} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <div />
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                From
                <input type="date" className={`mt-1 ${inputClass}`} value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} required />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                To
                <input type="date" className={`mt-1 ${inputClass}`} value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} required />
              </label>
              <label className="col-span-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Reason
                <input className={`mt-1 ${inputClass}`} value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Optional" />
              </label>
              <Button type="submit" disabled={submitting === "leave-create"}>{submitting === "leave-create" ? "Submitting…" : "Submit"}</Button>
            </form>
          )}
          {leaveRequests.length === 0
            ? <EmptyState message="No leave requests for this employee." />
            : leaveRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{req.leave_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-neutral-500">{req.start_date} → {req.end_date}{req.reason ? ` · ${req.reason}` : ""}</p>
                </div>
                <Badge status={req.status} />
                {canLeaveApprove && req.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button type="button" disabled={submitting === `approve-${req.id}`}
                      onClick={() => void run(`approve-${req.id}`, () => api.patch(`/employees/${employee.id}/leave/${req.id}`, { status: "APPROVED" }), () => void loadLeave())}>
                      {submitting === `approve-${req.id}` ? "…" : "Approve"}
                    </Button>
                    <Button type="button" variant="outline" disabled={submitting === `deny-${req.id}`}
                      onClick={() => void run(`deny-${req.id}`, () => api.patch(`/employees/${employee.id}/leave/${req.id}`, { status: "DENIED" }), () => void loadLeave())}>
                      {submitting === `deny-${req.id}` ? "…" : "Deny"}
                    </Button>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* Assets tab */}
      {tab === "assets" && (
        <div className="space-y-3">
          {employee.assets.length === 0
            ? <EmptyState message="No assets assigned." />
            : employee.assets.map((a) => (
              <div key={a.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{a.asset_name}</p>
                  <p className="text-xs text-neutral-500">{a.category ?? "—"}{a.asset_tag ? ` · Tag: ${a.asset_tag}` : ""}</p>
                </div>
                <Badge status={a.status} />
              </div>
            ))
          }
          {canAssets && (
            <AssetForm employeeId={employee.id} run={run} submitting={submitting} setError={setFormError} onSaved={loadEmployee} />
          )}
        </div>
      )}

      {/* Skills & Certs tab */}
      {tab === "skills" && (
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">Skills</h3>
            {employee.skills.length === 0
              ? <EmptyState message="No skills recorded." />
              : employee.skills.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{s.skill_name}</p>
                    {s.category && <p className="text-xs text-neutral-500">{s.category}</p>}
                  </div>
                  {s.level != null && <span className="text-xs text-neutral-500">Level {s.level}/5</span>}
                  {s.verified && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Verified</span>}
                </div>
              ))
            }
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">Certifications</h3>
            {employee.certifications.length === 0
              ? <EmptyState message="No certifications recorded." />
              : employee.certifications.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{c.certification_name}</p>
                    {c.issuer && <p className="text-xs text-neutral-500">{c.issuer}</p>}
                  </div>
                  {c.expires_at && <span className="text-xs text-neutral-500">Expires {c.expires_at}</span>}
                  <Badge status={c.status} />
                </div>
              ))
            }
          </section>
        </div>
      )}

      {/* Performance tab */}
      {tab === "performance" && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">Goals</h3>
            {employee.goals.length === 0
              ? <EmptyState message="No goals set." />
              : employee.goals.map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{g.title}</p>
                    {g.target_date && <p className="text-xs text-neutral-500">Target: {g.target_date}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-neutral-200 dark:bg-neutral-700">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${g.progress_percent}%` }} />
                    </div>
                    <span className="text-xs text-neutral-500">{g.progress_percent}%</span>
                  </div>
                  <Badge status={g.status} />
                </div>
              ))
            }
            {canPerf && (
              <GoalForm employeeId={employee.id} run={run} submitting={submitting} setError={setFormError} onSaved={loadEmployee} />
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">Performance reviews</h3>
            {employee.performance_reviews.length === 0
              ? <EmptyState message="No reviews yet." />
              : employee.performance_reviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 mb-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{r.cycle_name}</p>
                    <div className="flex items-center gap-2">
                      {r.rating != null && <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{r.rating}/5</span>}
                      {r.reviewed_at && <span className="text-xs text-neutral-500">{r.reviewed_at}</span>}
                    </div>
                  </div>
                  {r.summary && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{r.summary}</p>}
                </div>
              ))
            }
            {canPerf && (
              <ReviewForm employeeId={employee.id} run={run} submitting={submitting} setError={setFormError} onSaved={loadEmployee} />
            )}
          </section>
        </div>
      )}

      {/* Documents tab */}
      {tab === "documents" && (
        <div className="space-y-4">
          {canDocs && (
            <div className="flex justify-end">
              <Button onClick={() => setShowDocForm(!showDocForm)}>{showDocForm ? "Cancel" : "Add document"}</Button>
            </div>
          )}
          {showDocForm && canDocs && (
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                await run("doc-create", () => api.post(`/employees/${employee.id}/documents`, {
                  doc_type: docType, title: docTitle, url: docUrl || null, expires_at: docExpires || null,
                }), () => { setShowDocForm(false); setDocTitle(""); setDocUrl(""); setDocExpires(""); void loadDocs(); });
              }}
              className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3 className="col-span-2 font-semibold text-neutral-900 dark:text-neutral-100">New document</h3>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Type
                <select className={`mt-1 ${inputClass}`} value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {["GENERAL","CONTRACT","ID","CERTIFICATE","NDA","POLICY","OFFER_LETTER","TAX","OTHER"].map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g," ")}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Title*
                <input className={`mt-1 ${inputClass}`} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required placeholder="e.g. Employment contract" />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                URL
                <input className={`mt-1 ${inputClass}`} value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…" />
              </label>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Expiry date
                <input type="date" className={`mt-1 ${inputClass}`} value={docExpires} onChange={(e) => setDocExpires(e.target.value)} />
              </label>
              <Button type="submit" disabled={submitting === "doc-create"} className="col-span-2 w-fit">
                {submitting === "doc-create" ? "Saving…" : "Add document"}
              </Button>
            </form>
          )}
          {documents.length === 0
            ? <EmptyState message="No documents on file." />
            : documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{doc.title}</p>
                  <p className="text-xs text-neutral-500">{doc.doc_type.replace(/_/g, " ")}{doc.expires_at ? ` · Expires ${doc.expires_at}` : ""}</p>
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
                    Open ↗
                  </a>
                )}
                {canDocs && (
                  <button type="button" disabled={submitting === `del-doc-${doc.id}`}
                    onClick={() => { if (!window.confirm("Delete this document?")) return; void run(`del-doc-${doc.id}`, () => api.delete(`/employees/${employee.id}/documents/${doc.id}`), () => void loadDocs()); }}
                    className="text-xs text-red-500 hover:underline disabled:opacity-50 dark:text-red-400">
                    {submitting === `del-doc-${doc.id}` ? "…" : "Delete"}
                  </button>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* Lifecycle tab */}
      {tab === "lifecycle" && (
        <div className="space-y-3">
          {employee.lifecycle_events.length === 0
            ? <EmptyState message="No lifecycle events." />
            : employee.lifecycle_events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{ev.title}</p>
                  <p className="text-xs text-neutral-500">{ev.event_type}{ev.due_at ? ` · Due ${ev.due_at}` : ""}</p>
                </div>
                <Badge status={ev.status} />
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── Vacation Tab ────────────────────────────────────────────────────────────

function VacationTab({
  employeeId,
  leaveRequests,
  canCreate,
  canApprove,
  submitting,
  run,
  loadLeave,
}: {
  employeeId: string;
  leaveRequests: EmployeeLeaveRequest[];
  canCreate: boolean;
  canApprove: boolean;
  submitting: string | null;
  run: (key: string, action: () => Promise<unknown>, onDone?: () => void) => Promise<void>;
  loadLeave: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd]     = useState("");
  const [reason, setReason] = useState("");

  const vacations = leaveRequests.filter((r) => r.leave_type === "VACATION");

  // Days-count helper (inclusive)
  const daysBetween = (s: string, e: string) => {
    const ms = new Date(e).getTime() - new Date(s).getTime();
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  };

  const currentYear = new Date().getFullYear();
  const thisYear = vacations.filter((r) => r.start_date?.startsWith(String(currentYear)));
  const approved  = thisYear.filter((r) => r.status === "APPROVED");
  const pending   = thisYear.filter((r) => r.status === "PENDING");
  const upcoming  = approved.filter((r) => new Date(r.start_date) >= new Date());

  const daysApproved = approved.reduce((sum, r) => sum + daysBetween(r.start_date, r.end_date), 0);
  const daysPending  = pending.reduce((sum, r) => sum + daysBetween(r.start_date, r.end_date), 0);

  const STATUS_STYLE: Record<string, string> = {
    PENDING:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    APPROVED:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    DENIED:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    CANCELLED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    void run("vacation-create", () =>
      api.post(`/employees/${employeeId}/leave`, {
        leave_type: "VACATION",
        start_date: start,
        end_date: end,
        reason: reason || null,
      }),
      () => { setShowForm(false); setStart(""); setEnd(""); setReason(""); loadLeave(); }
    );
  };

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Days approved", value: daysApproved, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Days pending",  value: daysPending,  color: "text-amber-600 dark:text-amber-400" },
          { label: "Upcoming trips",value: upcoming.length, color: "text-primary-600 dark:text-primary-400" },
          { label: `Requests ${currentYear}`, value: thisYear.length, color: "text-neutral-700 dark:text-neutral-300" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Request button */}
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Plan vacation"}
          </Button>
        </div>
      )}

      {/* New vacation form */}
      {showForm && canCreate && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-3">
          <h3 className="col-span-full font-semibold text-neutral-900 dark:text-neutral-100">New vacation request</h3>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Start date*
            <input type="date" className={`mt-1 ${inputClass}`} value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            End date*
            <input type="date" className={`mt-1 ${inputClass}`} value={end} onChange={(e) => setEnd(e.target.value)} required min={start} />
          </label>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Reason (optional)
            <input className={`mt-1 ${inputClass}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Summer holiday" />
          </label>
          {start && end && new Date(end) >= new Date(start) && (
            <p className="col-span-full text-sm text-neutral-500 dark:text-neutral-400">
              Duration: <strong className="text-neutral-800 dark:text-neutral-200">{daysBetween(start, end)} day{daysBetween(start, end) !== 1 ? "s" : ""}</strong>
            </p>
          )}
          <Button type="submit" disabled={submitting === "vacation-create"} className="w-fit">
            {submitting === "vacation-create" ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      )}

      {/* Vacation list */}
      {vacations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No vacation requests yet.
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">All vacation requests</h3>
          {vacations.map((req) => {
            const days = daysBetween(req.start_date, req.end_date);
            const isPast = new Date(req.end_date) < new Date();
            return (
              <div key={req.id} className={`flex items-center gap-4 rounded-xl border p-4 shadow-soft-lg ${isPast ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
                {/* Date range block */}
                <div className="flex w-28 shrink-0 flex-col items-center rounded-lg border border-neutral-200 bg-white px-3 py-2 text-center dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{req.start_date}</span>
                  <span className="my-0.5 text-xs text-neutral-400">↓</span>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{req.end_date}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {days} day{days !== 1 ? "s" : ""} vacation
                    {isPast ? <span className="ml-2 text-xs font-normal text-neutral-400">(past)</span> : null}
                  </p>
                  {req.reason && <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{req.reason}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[req.status] ?? STATUS_STYLE.CANCELLED}`}>
                  {req.status}
                </span>
                {/* Approve/deny for managers */}
                {canApprove && req.status === "PENDING" && (
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" disabled={submitting === `vap-approve-${req.id}`}
                      onClick={() => void run(`vap-approve-${req.id}`, () => api.patch(`/employees/${employeeId}/leave/${req.id}`, { status: "APPROVED" }), loadLeave)}>
                      {submitting === `vap-approve-${req.id}` ? "…" : "Approve"}
                    </Button>
                    <Button type="button" variant="outline" disabled={submitting === `vap-deny-${req.id}`}
                      onClick={() => void run(`vap-deny-${req.id}`, () => api.patch(`/employees/${employeeId}/leave/${req.id}`, { status: "DENIED" }), loadLeave)}>
                      {submitting === `vap-deny-${req.id}` ? "…" : "Deny"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-form components to keep the main component lean

function CompForm({ employeeId, run, submitting, setError: _setError, onSaved }: {
  employeeId: string;
  run: (key: string, action: () => Promise<unknown>, onDone?: () => void) => Promise<void>;
  submitting: string | null;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const [freq, setFreq]     = useState("MONTHLY");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [type, setType]     = useState("BASE");
  const [from, setFrom]     = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!amount || !from) return;
    void run("comp", () => api.post(`/employees/${employeeId}/compensation`, {
      pay_frequency: freq, amount_cents: Math.round(parseFloat(amount) * 100),
      currency, compensation_type: type, effective_from: from,
    }), () => { setAmount(""); setFrom(""); }).then(onSaved);
  };
  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h4 className="col-span-2 font-semibold text-sm text-neutral-900 dark:text-neutral-100">Add compensation record</h4>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Frequency
        <select className={`mt-1 ${inputClass}`} value={freq} onChange={(e) => setFreq(e.target.value)}>
          {PAY_FREQS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Amount (e.g. 5000.00)
        <input className={`mt-1 ${inputClass}`} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Currency
        <input className={`mt-1 ${inputClass}`} value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Type (BASE, BONUS…)
        <input className={`mt-1 ${inputClass}`} value={type} onChange={(e) => setType(e.target.value)} />
      </label>
      <label className="col-span-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Effective from
        <input type="date" className={`mt-1 ${inputClass}`} value={from} onChange={(e) => setFrom(e.target.value)} required />
      </label>
      <Button type="submit" disabled={submitting === "comp"} className="w-fit">
        {submitting === "comp" ? "Saving…" : "Save compensation"}
      </Button>
    </form>
  );
}

function AssetForm({ employeeId, run, submitting, setError: _setError, onSaved }: {
  employeeId: string;
  run: (key: string, action: () => Promise<unknown>, onDone?: () => void) => Promise<void>;
  submitting: string | null;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const [name, setName]         = useState("");
  const [tag, setTag]           = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes]       = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    void run("asset", () => api.post(`/employees/${employeeId}/assets`, {
      asset_name: name, asset_tag: tag || null, category: category || null, notes: notes || null,
    }), () => { setName(""); setTag(""); setCategory(""); setNotes(""); }).then(onSaved);
  };
  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h4 className="col-span-2 font-semibold text-sm text-neutral-900 dark:text-neutral-100">Assign asset</h4>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Asset name*
        <input className={`mt-1 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} required placeholder="MacBook Pro 16" />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Asset tag
        <input className={`mt-1 ${inputClass}`} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="ASSET-001" />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Category
        <input className={`mt-1 ${inputClass}`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Laptop" />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Notes
        <input className={`mt-1 ${inputClass}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Button type="submit" disabled={submitting === "asset"} className="w-fit">
        {submitting === "asset" ? "Saving…" : "Assign asset"}
      </Button>
    </form>
  );
}

function GoalForm({ employeeId, run, submitting, setError: _setError, onSaved }: {
  employeeId: string;
  run: (key: string, action: () => Promise<unknown>, onDone?: () => void) => Promise<void>;
  submitting: string | null;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const [title, setTitle]   = useState("");
  const [target, setTarget] = useState("");
  const [desc, setDesc]     = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title) return;
    void run("goal", () => api.post(`/employees/${employeeId}/goals`, {
      title, description: desc || null, target_date: target || null, status: "NOT_STARTED", progress_percent: 0,
    }), () => { setTitle(""); setTarget(""); setDesc(""); }).then(onSaved);
  };
  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h4 className="col-span-2 font-semibold text-sm text-neutral-900 dark:text-neutral-100">Add goal</h4>
      <label className="col-span-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Title*
        <input className={`mt-1 ${inputClass}`} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Goal title" />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Target date
        <input type="date" className={`mt-1 ${inputClass}`} value={target} onChange={(e) => setTarget(e.target.value)} />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Description
        <input className={`mt-1 ${inputClass}`} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <Button type="submit" disabled={submitting === "goal"} className="w-fit">
        {submitting === "goal" ? "Saving…" : "Add goal"}
      </Button>
    </form>
  );
}

function ReviewForm({ employeeId, run, submitting, setError: _setError, onSaved }: {
  employeeId: string;
  run: (key: string, action: () => Promise<unknown>, onDone?: () => void) => Promise<void>;
  submitting: string | null;
  setError: (e: string | null) => void;
  onSaved: () => void;
}) {
  const [cycle, setCycle]   = useState("");
  const [rating, setRating] = useState("");
  const [summary, setSummary] = useState("");
  const [date, setDate]     = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!cycle) return;
    void run("review", () => api.post(`/employees/${employeeId}/performance-reviews`, {
      cycle_name: cycle, rating: rating ? parseFloat(rating) : null, summary: summary || null, reviewed_at: date || null,
    }), () => { setCycle(""); setRating(""); setSummary(""); setDate(""); }).then(onSaved);
  };
  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h4 className="col-span-2 font-semibold text-sm text-neutral-900 dark:text-neutral-100">Add performance review</h4>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Cycle name*
        <input className={`mt-1 ${inputClass}`} value={cycle} onChange={(e) => setCycle(e.target.value)} required placeholder="Q1 2026" />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Rating (1-5)
        <input type="number" step="0.1" min="1" max="5" className={`mt-1 ${inputClass}`} value={rating} onChange={(e) => setRating(e.target.value)} />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Review date
        <input type="date" className={`mt-1 ${inputClass}`} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Summary
        <input className={`mt-1 ${inputClass}`} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <Button type="submit" disabled={submitting === "review"} className="w-fit">
        {submitting === "review" ? "Saving…" : "Add review"}
      </Button>
    </form>
  );
}
