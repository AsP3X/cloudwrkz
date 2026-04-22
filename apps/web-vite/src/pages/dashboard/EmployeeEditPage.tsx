import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Employee } from "@/lib/types";

// Human: HR employee editor that loads a record, validates fields, links cloudwrkz users, and persists PATCH updates.
// Agent: ROUTE /employees/:id/edit; HTTP GET/PATCH /employees/*; DIALOG user picker; REQUIRES employees.update permission.

type EditableEmployee = {
  first_name: string;
  last_name: string;
  display_name: string;
  department: string;
  job_title: string;
  location: string;
  status: string;
  employment_type: string;
  manager_employee_id: string;
  notes: string;
};

interface CwUser {
  id: string;
  name: string | null;
  email: string;
}

const EMPTY_FORM: EditableEmployee = {
  first_name: "",
  last_name: "",
  display_name: "",
  department: "",
  job_title: "",
  location: "",
  status: "ACTIVE",
  employment_type: "FULL_TIME",
  manager_employee_id: "",
  notes: "",
};

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "TERMINATED"] as const;
const EMPLOYMENT_TYPE_OPTIONS = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "INTERN",
  "TEMPORARY",
] as const;

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

// Human: Form-heavy page coordinating employee identity fields, manager linkage, and optional CW user association.
// Agent: STATE form+linkedUserId+picker; useParams id; navigate on success; MUTATES via api client with error surface.

export default function EmployeeEditPage() {
  const { can } = useAuth();
  const canEdit = can("employees.update");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<EditableEmployee>(EMPTY_FORM);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<CwUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Linked cloudwrkz user
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);

  // User picker dialog state
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [userPickerSearch, setUserPickerSearch] = useState("");
  const [userPickerDraft, setUserPickerDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [empData, listData] = await Promise.all([
        api.get<{ employee: Partial<EditableEmployee & { manager_employee_id?: string | null; user_id?: string | null }> }>(`/employees/${id}`),
        api.get<{ employees: Employee[] }>("/employees"),
      ]);
      const e = empData.employee ?? {};
      setForm({
        first_name: String(e.first_name ?? ""),
        last_name: String(e.last_name ?? ""),
        display_name: String(e.display_name ?? ""),
        department: String(e.department ?? ""),
        job_title: String(e.job_title ?? ""),
        location: String(e.location ?? ""),
        status: String(e.status ?? "ACTIVE"),
        employment_type: String(e.employment_type ?? "FULL_TIME"),
        manager_employee_id: String(e.manager_employee_id ?? ""),
        notes: String(e.notes ?? ""),
      });
      setLinkedUserId(e.user_id ?? null);
      setEmployees((listData.employees ?? []).filter((emp) => emp.id !== id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.get<{ users: CwUser[] }>("/users");
      setUsers(data.users ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void load();
    void loadUsers();
  }, [load, loadUsers]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/employees/${id}`, {
        ...form,
        manager_employee_id: form.manager_employee_id || null,
        ...(linkedUserId !== null ? { user_id: linkedUserId } : {}),
      });
      navigate(`${ROUTES.EMPLOYEES}/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  const openUserPicker = useCallback(() => {
    setUserPickerDraft(linkedUserId);
    setUserPickerSearch("");
    setUserPickerOpen(true);
  }, [linkedUserId]);

  const applyUserPicker = useCallback(() => {
    setLinkedUserId(userPickerDraft);
    setUserPickerOpen(false);
    setUserPickerSearch("");
  }, [userPickerDraft]);

  const filteredUsers = useMemo(() => {
    const q = userPickerSearch.trim().toLowerCase();
    const sorted = [...users].sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email)
    );
    if (!q) return sorted;
    return sorted.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, userPickerSearch]);

  const linkedUser = useMemo(
    () => (linkedUserId ? users.find((u) => u.id === linkedUserId) ?? null : null),
    [linkedUserId, users]
  );

  if (!canEdit) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to edit employee records."
        primaryHref={ROUTES.EMPLOYEES}
        primaryLabel="Back to Employees"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={onSubmit} className="space-y-4 bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Edit Employee</h1>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <Field label="First name" value={form.first_name} onChange={(v) => setForm((p) => ({ ...p, first_name: v }))} />
        <Field label="Last name" value={form.last_name} onChange={(v) => setForm((p) => ({ ...p, last_name: v }))} />
        <Field label="Display name" value={form.display_name} onChange={(v) => setForm((p) => ({ ...p, display_name: v }))} />
        <Field label="Department" value={form.department} onChange={(v) => setForm((p) => ({ ...p, department: v }))} />
        <Field label="Job title" value={form.job_title} onChange={(v) => setForm((p) => ({ ...p, job_title: v }))} />
        <Field label="Location" value={form.location} onChange={(v) => setForm((p) => ({ ...p, location: v }))} />
        <SelectField
          label="Status"
          value={form.status}
          options={STATUS_OPTIONS}
          onChange={(v) => setForm((p) => ({ ...p, status: v }))}
        />
        <SelectField
          label="Employment type"
          value={form.employment_type}
          options={EMPLOYMENT_TYPE_OPTIONS}
          onChange={(v) => setForm((p) => ({ ...p, employment_type: v }))}
        />
        <label className="block">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Superior (manager)</span>
          <select
            className={inputClass}
            value={form.manager_employee_id}
            onChange={(e) => setForm((p) => ({ ...p, manager_employee_id: e.target.value }))}
          >
            <option value="">— None —</option>
            {employees.map((emp) => {
              const fullName = `${emp.first_name} ${emp.last_name}`.trim();
              const name = emp.display_name ?? (fullName || emp.employee_code);
              return (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} – {name}
                </option>
              );
            })}
          </select>
        </label>
        <Field label="Notes" value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} multiline />

        {/* Linked cloudwrkz user */}
        <div>
          <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Linked cloudwrkz user
          </span>
          <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 overflow-hidden">
            <div className="px-3 py-2.5 min-h-[40px] flex items-center gap-2">
              {linkedUser ? (
                <>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    {(linkedUser.name ?? linkedUser.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {linkedUser.name && (
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {linkedUser.name}
                      </p>
                    )}
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {linkedUser.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkedUserId(null)}
                    className="shrink-0 text-xs text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 transition-colors"
                    aria-label="Remove link"
                  >
                    Remove
                  </button>
                </>
              ) : linkedUserId ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Linked to user <span className="font-mono text-xs">{linkedUserId}</span>
                </p>
              ) : (
                <p className="text-sm text-neutral-400 dark:text-neutral-500">No user linked yet.</p>
              )}
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-800 px-2 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full text-sm font-normal"
                onClick={openUserPicker}
              >
                {linkedUserId ? "Change linked user…" : "Link a user…"}
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Connect this employee record to a cloudwrkz login account.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          <Button asChild variant="outline" type="button">
            <Link to={`${ROUTES.EMPLOYEES}/${id}`}>Cancel</Link>
          </Button>
        </div>
      </form>

      {/* User picker dialog */}
      <Dialog
        nested
        open={userPickerOpen}
        onOpenChange={(open) => {
          setUserPickerOpen(open);
          if (!open) setUserPickerSearch("");
        }}
        title="Link cloudwrkz user"
        description="Search and select the cloudwrkz account to link to this employee."
      >
        <div className="space-y-4 p-5 sm:p-7">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Search users
            <input
              type="search"
              className={inputClass}
              value={userPickerSearch}
              onChange={(e) => setUserPickerSearch(e.target.value)}
              placeholder="Name or email…"
              autoComplete="off"
            />
          </label>

          <div className="max-h-[min(50vh,320px)] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            {users.length === 0 ? (
              <p className="p-4 text-sm text-neutral-600 dark:text-neutral-400">No users loaded.</p>
            ) : filteredUsers.length === 0 ? (
              <p className="p-4 text-sm text-neutral-600 dark:text-neutral-400">No users match your search.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredUsers.map((user) => {
                  const selected = userPickerDraft === user.id;
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setUserPickerDraft(selected ? null : user.id)}
                        className={
                          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors " +
                          (selected
                            ? "bg-primary-50 dark:bg-primary-900/20"
                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/80")
                        }
                      >
                        <div
                          className={
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                            (selected
                              ? "bg-primary-100 text-primary-700 dark:bg-primary-800/60 dark:text-primary-300"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400")
                          }
                        >
                          {(user.name ?? user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          {user.name && (
                            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {user.name}
                            </p>
                          )}
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {user.email}
                          </p>
                        </div>
                        {selected && (
                          <svg
                            className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {userPickerDraft
                ? `Selected: ${users.find((u) => u.id === userPickerDraft)?.name ?? users.find((u) => u.id === userPickerDraft)?.email ?? userPickerDraft}`
                : "No user selected"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setUserPickerOpen(false);
                  setUserPickerSearch("");
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={applyUserPicker}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {multiline ? (
        <textarea
          className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
