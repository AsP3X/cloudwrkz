// Human: Department management page – list, create, edit and delete company departments.
// Create and edit run in a modal dialog; managers see counts and assignments. Actions are queued (HTTP 202).
// Agent: CALLS GET/POST/PATCH/DELETE /employees/departments, GET /employees; Dialog OPENS for showCreate.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { Employee } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { type LoginQueuedUiState, useAuth } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
  description: string | null;
  manager_employee_ids: string[];
  manager_labels: string[];
  parent_department_id: string | null;
  color: string | null;
  status: string;
  employee_count: number;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  manager_employee_ids: [] as string[],
  parent_department_id: "",
  color: "#6366f1",
  status: "ACTIVE",
};

const PRESET_COLORS = [
  "#6366f1","#3b82f6","#10b981","#f59e0b",
  "#ef4444","#8b5cf6","#f97316","#14b8a6",
  "#ec4899","#06b6d4","#84cc16","#64748b",
];

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INACTIVE: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

// Human: One-line label for an employee row (matches the old <option> text).
// Agent: READS Employee; RETURNS `${code} – ${display or name or code}`.
function employeeChoiceLabel(emp: Employee): string {
  const fullName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
  const label = emp.display_name ?? (fullName || emp.employee_code);
  return `${emp.employee_code} – ${label}`;
}

// Human: Lowercased haystack for filtering the picker list by search text.
// Agent: READS Employee name/code/email/title fields; RETURNS single lowercase string.
function employeeSearchHaystack(emp: Employee): string {
  const fullName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
  return [
    emp.employee_code,
    emp.display_name ?? "",
    fullName,
    emp.work_email ?? "",
    emp.job_title ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmployeeDepartmentsPage() {
  const { can } = useAuth();
  const canView   = can("employees.departments.view") || can("employees.departments.manage");
  const canManage = can("employees.departments.manage");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch]             = useState("");
  const [viewMode, setViewMode]         = useState<"list" | "table">("list");
  const [showCreate, setShowCreate]     = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Human: Manager field opens a searchable modal; draft IDs apply only after "Apply".
  // Agent: STORES managerDialogOpen, managerDialogSearch, managerDraftIds; SYNC draft FROM form on open; MUTATES form.manager_employee_ids on Apply.
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [managerDialogSearch, setManagerDialogSearch] = useState("");
  const [managerDraftIds, setManagerDraftIds] = useState<string[]>([]);

  // Human: After HTTP 202, the global mutation-queued event drives the same banner as ToDo create (replaces submit).
  // Agent: LISTENS cloudwrkz:mutation-queued/finished; FILTERS path prefix /employees/departments; REQUIRES showCreateRef.
  const [deptSaveQueuedUi, setDeptSaveQueuedUi] = useState<LoginQueuedUiState | null>(null);
  const showCreateRef = useRef(showCreate);
  showCreateRef.current = showCreate;

  // ─── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptData, empData] = await Promise.all([
        api.get<{ departments: Department[] }>("/employees/departments"),
        api.get<{ employees: Employee[] }>("/employees"),
      ]);
      setDepartments(deptData.departments ?? []);
      setEmployees(empData.employees ?? []);
    } catch {
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeForm = useCallback(() => {
    setShowCreate(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setManagerDialogOpen(false);
    setManagerDialogSearch("");
    setDeptSaveQueuedUi(null);
  }, []);

  // Human: Queued banner from HTTP 202; on success close dialog when polling completes (detail.ok from api client).
  // Agent: LISTENS cloudwrkz:mutation-queued/finished; on ok CALLS closeForm WHEN showCreateRef; CLEARS deptSaveQueuedUi.
  useEffect(() => {
    const onQueued = (e: Event) => {
      const d = (
        e as CustomEvent<{
          path: string;
          message?: string;
          retry_deadline_secs: number;
        }>
      ).detail;
      if (!d.path.startsWith("/employees/departments")) return;
      if (!showCreateRef.current) return;
      const retry = d.retry_deadline_secs ?? 30;
      const maxWaitSecs = retry + 5;
      const isCreate = d.path === "/employees/departments";
      setDeptSaveQueuedUi({
        headline: isCreate ? "Creating department" : "Updating department",
        supportLines: [
          "Your save was accepted with HTTP 202: the API applies it in the background, including automatic retries if the database was briefly unavailable.",
          `If Postgres was down when you submitted, the server retries for up to about ${retry} seconds—stay on this page.`,
          "We poll job status about once per second—do not submit the same action again unless this times out or fails.",
          `If nothing completes within about ${maxWaitSecs} seconds, you will see an error.`,
        ],
        maxWaitSecs,
        startedAt: Date.now(),
      });
    };
    const onFinished = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; ok?: boolean }>).detail;
      if (!d.path.startsWith("/employees/departments")) return;
      setDeptSaveQueuedUi(null);
      if (d.ok === true && showCreateRef.current) {
        closeForm();
      }
    };
    window.addEventListener("cloudwrkz:mutation-queued", onQueued);
    window.addEventListener("cloudwrkz:mutation-finished", onFinished);
    return () => {
      window.removeEventListener("cloudwrkz:mutation-queued", onQueued);
      window.removeEventListener("cloudwrkz:mutation-finished", onFinished);
    };
  }, [closeForm]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setSubmitting(key);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message
        : err instanceof Error ? err.message
        : "Action failed"
      );
    } finally {
      setSubmitting(null);
    }
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowCreate(true);
  };

  const openEdit = (dept: Department) => {
    setForm({
      name: dept.name,
      description: dept.description ?? "",
      manager_employee_ids: dept.manager_employee_ids ?? [],
      parent_department_id: dept.parent_department_id ?? "",
      color: dept.color ?? "#6366f1",
      status: dept.status,
    });
    setEditingId(dept.id);
    setShowCreate(true);
  };

  const submitForm = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      manager_employee_ids: form.manager_employee_ids,
      parent_department_id: form.parent_department_id || null,
      color: form.color || null,
      ...(editingId ? { status: form.status } : {}),
    };
    void runAction(editingId ?? "create", async () => {
      setDeptSaveQueuedUi(null);
      if (editingId) {
        await api.patch(`/employees/departments/${editingId}`, body);
      } else {
        await api.post("/employees/departments", body);
      }
      closeForm();
    });
  };

  const confirmDelete = (id: string) => {
    void runAction(`delete-${id}`, async () => {
      await api.delete(`/employees/departments/${id}`);
      setDeleteId(null);
    });
  };

  // ─── Derived state ─────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const visible = departments.filter((d) => {
    if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
    if (!q) return true;
    return (d.name + " " + (d.description ?? "")).toLowerCase().includes(q);
  });

  const deptOptions = departments.filter((d) => d.id !== editingId);

  // Human: Resolved labels for each selected manager ID (shown in the compact scroll list).
  // Agent: READS form.manager_employee_ids + employees; RETURNS { id, label }[] in form order.
  const selectedManagerRows = useMemo(
    () =>
      form.manager_employee_ids.map((id) => {
        const emp = employees.find((e) => e.id === id);
        return { id, label: emp ? employeeChoiceLabel(emp) : id };
      }),
    [form.manager_employee_ids, employees]
  );

  // Human: Employees shown in the modal, sorted by code and filtered by the search box.
  // Agent: READS employees + managerDialogSearch; RETURNS sorted Employee[] subset.
  const managerDialogEmployees = useMemo(() => {
    const q = managerDialogSearch.trim().toLowerCase();
    const list = [...employees].sort((a, b) => a.employee_code.localeCompare(b.employee_code));
    if (!q) return list;
    return list.filter((emp) => employeeSearchHaystack(emp).includes(q));
  }, [employees, managerDialogSearch]);

  const openManagerDialog = useCallback(() => {
    setManagerDraftIds([...form.manager_employee_ids]);
    setManagerDialogSearch("");
    setManagerDialogOpen(true);
  }, [form.manager_employee_ids]);

  const applyManagerDraft = useCallback(() => {
    setForm((f) => ({ ...f, manager_employee_ids: managerDraftIds }));
    setManagerDialogOpen(false);
    setManagerDialogSearch("");
  }, [managerDraftIds]);

  const inputCls =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
    "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 focus:outline-none " +
    "focus:ring-2 focus:ring-indigo-500";

  const labelCls = "block text-sm font-medium text-neutral-700 dark:text-neutral-300";

  const deptFormSubmitKey = editingId ?? "create";
  const deptFormBusy =
    Boolean(deptSaveQueuedUi) || submitting === deptFormSubmitKey;

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have access to department management."
        primaryHref={ROUTES.DASHBOARD}
        primaryLabel="Back to Dashboard"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Departments</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            Manage your organisation's department structure
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>+ New department</Button>
        )}
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {actionError}
        </div>
      )}

      {/* Human: Create/edit department fields live in a modal (same flow from header or empty state). */}
      {/* Agent: Dialog open=showCreate; onOpenChange CALLS closeForm; closeOnEscape false WHILE managerDialogOpen. */}
      {canManage && (
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          title={editingId ? "Edit department" : "New department"}
          description={
            editingId
              ? "Update details and save when you are done."
              : "Fill in the details, then choose Create department."
          }
          closeOnEscape={!managerDialogOpen}
        >
          <div className="p-5 sm:p-7">
          <form onSubmit={submitForm} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Name */}
            <label className={`${labelCls} md:col-span-2`}>
              Name *
              <input
                className={`mt-1 ${inputCls}`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Engineering"
                required
                disabled={deptFormBusy}
              />
            </label>

            {/* Description */}
            <label className={`${labelCls} md:col-span-2`}>
              Description
              <input
                className={`mt-1 ${inputCls}`}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short description of this department"
                disabled={deptFormBusy}
              />
            </label>

            {/* Human: Selected managers render as a short scroll list; a button opens the search modal. */}
            {/* Agent: SCROLL max-h-32 lists selectedManagerRows; BUTTON CALLS openManagerDialog; nested Dialog EDITS draft. */}
            <div className={labelCls}>
              <span className="block">Department managers</span>
              <div
                className={
                  "mt-1 overflow-hidden rounded-lg border border-neutral-300 bg-white " +
                  "dark:border-neutral-700 dark:bg-neutral-950"
                }
              >
                <div className="max-h-32 overflow-y-auto px-2 py-2 scrollbar-thin">
                  {selectedManagerRows.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-neutral-500 dark:text-neutral-400">
                      No managers selected yet.
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {selectedManagerRows.map(({ id, label }) => (
                        <li
                          key={id}
                          className="rounded-md px-2 py-1.5 text-sm leading-snug text-neutral-800 dark:text-neutral-200"
                        >
                          <span className="break-words">{label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border-t border-neutral-200 px-2 py-2 dark:border-neutral-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-full text-sm font-normal"
                    onClick={openManagerDialog}
                    disabled={deptFormBusy}
                  >
                    {selectedManagerRows.length === 0 ? "Choose managers…" : "Add or change managers…"}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Search and select one or more employees as department managers.
              </p>
            </div>

            {/* Parent department */}
            <label className={labelCls}>
              Parent department
              <select
                className={`mt-1 ${inputCls}`}
                value={form.parent_department_id}
                onChange={(e) => setForm((f) => ({ ...f, parent_department_id: e.target.value }))}
                disabled={deptFormBusy}
              >
                <option value="">— None (top-level) —</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>

            {/* Color */}
            <div className="space-y-2">
              <span className={labelCls}>Department color</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={deptFormBusy}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:pointer-events-none"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "#fff" : "transparent",
                      boxShadow: form.color === c ? `0 0 0 2px ${c}` : undefined,
                    }}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  className="w-7 h-7 rounded cursor-pointer border border-neutral-300 dark:border-neutral-700 disabled:opacity-50"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  title="Custom colour"
                  disabled={deptFormBusy}
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {editingId && (
              <label className={labelCls}>
                Status
                <select
                  className={`mt-1 ${inputCls}`}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={deptFormBusy}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
              <Button type="button" variant="ghost" onClick={closeForm} disabled={deptFormBusy}>
                Cancel
              </Button>
              {deptSaveQueuedUi ? (
                <LoginQueuedBanner shrinkToContent state={deptSaveQueuedUi} className="max-w-[min(100%,22rem)]" />
              ) : (
                <Button type="submit" variant="primary" loading={deptFormBusy}>
                  {editingId ? "Save changes" : "Create department"}
                </Button>
              )}
            </div>
          </form>
          </div>

          <Dialog
            nested
            open={managerDialogOpen}
            onOpenChange={(open) => {
              setManagerDialogOpen(open);
              if (!open) setManagerDialogSearch("");
            }}
            title="Department managers"
            description="Search employees and tick any number of managers. Apply saves to this form; the department is not stored until you save the department."
          >
            <div className="space-y-4 p-5 sm:p-7">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Search employees
                <input
                  type="search"
                  className={`mt-1 ${inputCls}`}
                  value={managerDialogSearch}
                  onChange={(e) => setManagerDialogSearch(e.target.value)}
                  placeholder="Name, code, email, or job title…"
                  autoComplete="off"
                />
              </label>
              <div className="max-h-[min(50vh,320px)] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                {employees.length === 0 ? (
                  <p className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                    No employees loaded.
                  </p>
                ) : managerDialogEmployees.length === 0 ? (
                  <p className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                    No employees match your search.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {managerDialogEmployees.map((emp) => {
                      const checked = managerDraftIds.includes(emp.id);
                      return (
                        <li key={emp.id}>
                          <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/80">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-950"
                              checked={checked}
                              onChange={() => {
                                setManagerDraftIds((prev) =>
                                  prev.includes(emp.id)
                                    ? prev.filter((id) => id !== emp.id)
                                    : [...prev, emp.id]
                                );
                              }}
                            />
                            <span className="min-w-0 text-sm text-neutral-800 dark:text-neutral-200">
                              {employeeChoiceLabel(emp)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {managerDraftIds.length} selected
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setManagerDialogOpen(false);
                      setManagerDialogSearch("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={applyManagerDraft}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </Dialog>
        </Dialog>
      )}

      {/* Filters + view mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search departments…"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "list"
                ? "bg-primary-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-primary-600 text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Delete department?
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              This will remove the department record. Employees assigned to it will keep their
              department name but it will no longer appear in this list.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => confirmDelete(deleteId)}
                disabled={submitting === `delete-${deleteId}`}
              >
                {submitting === `delete-${deleteId}` ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Department list */}
      {loading ? (
        <div className="py-12 text-center text-neutral-500 dark:text-neutral-400">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 py-16 text-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            {departments.length === 0
              ? "No departments yet. Create your first department to get started."
              : "No departments match your filters."}
          </p>
          {canManage && departments.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Create first department
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-3">
          {visible.map((dept) => {
            const parentName = departments.find((d) => d.id === dept.parent_department_id)?.name ?? "—";
            return (
              <div
                key={dept.id}
                className="group rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white shadow-sm"
                        style={{ backgroundColor: dept.color ?? "#6366f1" }}
                      >
                        {dept.name[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">{dept.name}</h3>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[dept.status] ?? STATUS_STYLE.INACTIVE}`}>
                          {dept.status}
                        </span>
                      </div>
                    </div>
                    {dept.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">{dept.description}</p>
                    )}
                    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      <MetaRow label="Employees" value={String(dept.employee_count)} />
                      <MetaRow label="Heads" value={dept.manager_labels.length > 0 ? dept.manager_labels.join(", ") : "—"} />
                      <MetaRow label="Parent" value={parentName} />
                    </dl>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(dept)}
                        className="rounded p-1.5 text-neutral-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40"
                        title="Edit"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(dept.id)}
                        className="rounded p-1.5 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-center">Employees</th>
                <th className="px-4 py-3 font-semibold">Heads</th>
                <th className="px-4 py-3 font-semibold">Parent</th>
                {canManage && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {visible.map((dept) => {
                const parentName = departments.find((d) => d.id === dept.parent_department_id)?.name ?? "—";
                return (
                  <tr key={dept.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                          style={{ backgroundColor: dept.color ?? "#6366f1" }}
                        >
                          {dept.name[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{dept.name}</p>
                          {dept.description && <p className="truncate text-xs text-neutral-500">{dept.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[dept.status] ?? STATUS_STYLE.INACTIVE}`}>
                        {dept.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-neutral-700 dark:text-neutral-300">{dept.employee_count}</td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{dept.manager_labels.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{parentName}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(dept)}
                            className="rounded p-1.5 text-neutral-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/40"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(dept.id)}
                            className="rounded p-1.5 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-neutral-500 dark:text-neutral-400 shrink-0">{label}</dt>
      <dd className="text-neutral-800 dark:text-neutral-200 font-medium text-right truncate">{value}</dd>
    </div>
  );
}
