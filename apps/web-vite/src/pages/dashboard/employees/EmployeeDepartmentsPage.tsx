// Human: Department management page – list, create, edit and delete company departments.
// Managers see employee counts and manager assignments. Actions are queued (HTTP 202).
// Agent: CALLS GET/POST/PATCH/DELETE /employees/departments, GET /employees.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Employee } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

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
  const [showCreate, setShowCreate]     = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });

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

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have access to department management."
        primaryHref={ROUTES.DASHBOARD}
        primaryLabel="Back to Dashboard"
      />
    );
  }

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

  const closeForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
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

  const inputCls =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm " +
    "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 focus:outline-none " +
    "focus:ring-2 focus:ring-indigo-500";

  const labelCls = "block text-sm font-medium text-neutral-700 dark:text-neutral-300";

  // ─── Render ────────────────────────────────────────────────────────────────

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

      {/* Create / Edit form */}
      {showCreate && canManage && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {editingId ? "Edit department" : "New department"}
          </h2>
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
              />
            </label>

            {/* Managers */}
            <label className={labelCls}>
              Department managers
              <select
                className={`mt-1 ${inputCls}`}
                value={form.manager_employee_ids}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setForm((f) => ({ ...f, manager_employee_ids: values }));
                }}
                multiple
              >
                {employees.map((emp) => {
                  const fullName = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
                  const label = emp.display_name ?? (fullName || emp.employee_code);
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} – {label}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Hold Cmd/Ctrl to select multiple managers.
              </p>
            </label>

            {/* Parent department */}
            <label className={labelCls}>
              Parent department
              <select
                className={`mt-1 ${inputCls}`}
                value={form.parent_department_id}
                onChange={(e) => setForm((f) => ({ ...f, parent_department_id: e.target.value }))}
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
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
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
                  className="w-7 h-7 rounded cursor-pointer border border-neutral-300 dark:border-neutral-700"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  title="Custom colour"
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
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
            )}

            {/* Actions */}
            <div className="flex gap-2 md:col-span-2">
              <Button
                type="submit"
                disabled={submitting === (editingId ?? "create")}
              >
                {submitting === (editingId ?? "create") ? "Saving…" : editingId ? "Save changes" : "Create department"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Filters */}
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((dept) => {
            const parentName = departments.find((d) => d.id === dept.parent_department_id)?.name;
            return (
              <div
                key={dept.id}
                className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Color swatch */}
                    <span
                      className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-sm"
                      style={{ backgroundColor: dept.color ?? "#6366f1" }}
                    >
                      {dept.name[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {dept.name}
                      </h3>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[dept.status] ?? STATUS_STYLE.INACTIVE}`}>
                        {dept.status}
                      </span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(dept)}
                        className="p-1.5 rounded text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(dept.id)}
                        className="p-1.5 rounded text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                {dept.description && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 line-clamp-2">
                    {dept.description}
                  </p>
                )}

                {/* Meta rows */}
                <dl className="space-y-1.5 text-sm">
                  <MetaRow label="Employees" value={String(dept.employee_count)} />
                  {dept.manager_labels.length > 0 && (
                    <MetaRow label="Heads" value={dept.manager_labels.join(", ")} />
                  )}
                  {parentName && (
                    <MetaRow label="Parent" value={parentName} />
                  )}
                </dl>
              </div>
            );
          })}
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
