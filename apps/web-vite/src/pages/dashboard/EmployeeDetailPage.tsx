// Human: Employee detail view: all fields, additional email list, manager list, and linked user account management.
// Agent: FETCH /employees/:id; STATE addEmail/addManager/linkUser/unlinkUser dialogs; PATCH via api; navigate back.

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { ROUTES } from "@/lib/constants/routes";
import type { Employee, EmployeeEmail, EmployeeManager, EmployeeStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils/date";

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_LEAVE: "On Leave",
  PROBATION: "Probation",
  TERMINATED: "Terminated",
};

const STATUS_BADGE: Record<EmployeeStatus, "success" | "warning" | "info" | "default" | "error"> = {
  ACTIVE: "success",
  PROBATION: "warning",
  ON_LEAVE: "info",
  INACTIVE: "default",
  TERMINATED: "error",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <dt className="w-44 shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">{value ?? <span className="text-neutral-400 dark:text-neutral-600">—</span>}</dd>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft-lg p-6">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add email dialog
// ---------------------------------------------------------------------------

function AddEmailDialog({
  open,
  onClose,
  onAdded,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  employeeId: string;
}) {
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("A valid email address is required.");
      return;
    }
    setIsLoading(true);
    try {
      await api.post(`/employees/${employeeId}/emails`, {
        email: email.trim().toLowerCase(),
        label: label.trim() || undefined,
      });
      setEmail("");
      setLabel("");
      onAdded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add email.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} title="Add email address">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@personal.com"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="personal, work, etc."
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading}>{isLoading ? "Adding…" : "Add email"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add manager dialog
// ---------------------------------------------------------------------------

function AddManagerDialog({
  open,
  onClose,
  onAdded,
  employeeId,
  currentManagers,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  employeeId: string;
  currentManagers: EmployeeManager[];
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Employee[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentManagerIds = new Set(currentManagers.map((m) => m.id));

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setIsSearching(true);
    try {
      const data = await api.get<{ employees: Employee[] }>(
        `/employees?limit=10&search=${encodeURIComponent(q)}`,
      );
      setResults((data.employees ?? []).filter((e) => e.id !== employeeId && !currentManagerIds.has(e.id)));
    } catch { setResults([]); }
    setIsSearching(false);
  }, [employeeId, currentManagerIds]);

  useEffect(() => {
    const t = setTimeout(() => { doSearch(search); }, 300);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const handleAdd = async (managerId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post(`/employees/${employeeId}/managers`, { managerEmployeeId: managerId });
      setSearch("");
      setResults([]);
      onAdded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add manager.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} title="Add manager">
      <div className="space-y-4">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees by name or email…"
        />
        {isSearching && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500">Searching…</p>
        )}
        {results.length > 0 && (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {results.map((emp) => (
              <li
                key={emp.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {emp.firstName} {emp.lastName}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{emp.email}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleAdd(emp.id)} disabled={isLoading}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!isSearching && search && results.length === 0 && (
          <p className="text-xs text-neutral-400 dark:text-neutral-500">No employees found.</p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Link user dialog
// ---------------------------------------------------------------------------

function LinkUserDialog({
  open,
  onClose,
  onLinked,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
  employeeId: string;
}) {
  const [email, setEmail] = useState("");
  const [foundUser, setFoundUser] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFoundUser(null);
    if (!email.trim() || !email.includes("@")) {
      setError("A valid email address is required.");
      return;
    }
    setIsChecking(true);
    try {
      const data = await api.get<{ exists: boolean; user: { id: string; email: string; name: string | null } | null }>(
        `/employees/check-email?email=${encodeURIComponent(email.trim())}`,
      );
      if (!data.exists || !data.user) {
        setError("No user account found with this email address.");
      } else {
        setFoundUser(data.user);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check email.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleLink = async () => {
    if (!foundUser) return;
    setIsLinking(true);
    try {
      await api.post(`/employees/${employeeId}/link-user`, { userId: foundUser.id });
      setEmail("");
      setFoundUser(null);
      onLinked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not link user.");
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} title="Link user account">
      <div className="space-y-4">
        <form onSubmit={handleCheckEmail} className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFoundUser(null); setError(null); }}
            placeholder="user@example.com"
            className="flex-1"
            autoFocus
          />
          <Button type="submit" disabled={isChecking} variant="ghost">
            {isChecking ? "Checking…" : "Find"}
          </Button>
        </form>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {foundUser && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              {foundUser.name ?? foundUser.email}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">{foundUser.email}</p>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isLinking}>Cancel</Button>
          <Button onClick={handleLink} disabled={!foundUser || isLinking}>
            {isLinking ? "Linking…" : "Link account"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EmployeeDetailPage
// ---------------------------------------------------------------------------

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, permissions } = useAuth();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [addManagerOpen, setAddManagerOpen] = useState(false);
  const [linkUserOpen, setLinkUserOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const canUpdate = permissions.length === 0 || can("employees.update");

  const fetchEmployee = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get<{ employee: Employee }>(`/employees/${id}`);
      setEmployee(data.employee);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchEmployee(); }, [fetchEmployee]);

  const handleRemoveEmail = async (emailId: string) => {
    if (!id) return;
    try {
      await api.delete(`/employees/${id}/emails/${emailId}`);
      fetchEmployee();
    } catch { /* ignore */ }
  };

  const handleRemoveManager = async (managerId: string) => {
    if (!id) return;
    try {
      await api.delete(`/employees/${id}/managers/${managerId}`);
      fetchEmployee();
    } catch { /* ignore */ }
  };

  const handleUnlink = async () => {
    if (!id) return;
    setIsUnlinking(true);
    try {
      await api.post(`/employees/${id}/unlink-user`, {});
      setUnlinkConfirmOpen(false);
      fetchEmployee();
    } catch { /* ignore */ }
    setIsUnlinking(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <svg className="h-8 w-8 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-12 text-center">
        <p className="text-neutral-500 dark:text-neutral-400">Employee not found.</p>
        <Button className="mt-4" variant="ghost" onClick={() => navigate(ROUTES.EMPLOYEES)}>
          Back to employees
        </Button>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.EMPLOYEES)} className="mt-1">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Employees
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{fullName}</h1>
            <Badge variant={STATUS_BADGE[employee.employeeStatus] ?? "default"}>
              {STATUS_LABELS[employee.employeeStatus] ?? employee.employeeStatus}
            </Badge>
          </div>
          {employee.title && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{employee.title}</p>
          )}
        </div>
        {canUpdate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(ROUTES.EMPLOYEES)}
            className="mt-1"
          >
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic information */}
        <SectionCard title="Basic information">
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <DetailRow label="First name" value={employee.firstName} />
            <DetailRow label="Last name" value={employee.lastName} />
            <DetailRow label="Email" value={employee.email} />
            <DetailRow label="Title" value={employee.title} />
            <DetailRow label="Role within company" value={employee.companyRole} />
            <DetailRow
              label="Department"
              value={
                employee.department ? (
                  <span>
                    {employee.department}{" "}
                    <span className="text-neutral-400 text-xs">(placeholder)</span>
                  </span>
                ) : null
              }
            />
          </dl>
        </SectionCard>

        {/* Finance & time */}
        <SectionCard title="Finance & time">
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <DetailRow
              label="Monthly salary"
              value={
                employee.monthlySalary != null
                  ? `€${employee.monthlySalary.toLocaleString("de-DE", { minimumFractionDigits: 2 })}`
                  : null
              }
            />
            <DetailRow
              label="Monthly expenses"
              value={
                employee.monthlyExpenses != null ? (
                  <span>
                    €{employee.monthlyExpenses.toLocaleString("de-DE", { minimumFractionDigits: 2 })}{" "}
                    <span className="text-neutral-400 text-xs">(placeholder)</span>
                  </span>
                ) : null
              }
            />
            <DetailRow
              label="Hours worked"
              value={
                employee.hoursWorked != null ? (
                  <span>
                    {employee.hoursWorked}h{" "}
                    <span className="text-neutral-400 text-xs">(placeholder)</span>
                  </span>
                ) : null
              }
            />
          </dl>
        </SectionCard>

        {/* Vacation */}
        <SectionCard title="Vacation">
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <DetailRow label="Available days" value={`${employee.vacationAvailable} days`} />
            <DetailRow label="Used days" value={`${employee.vacationUsed} days`} />
            <DetailRow label="Planned days" value={`${employee.vacationPlanned} days`} />
          </dl>
        </SectionCard>

        {/* Sick leave */}
        <SectionCard title="Sick leave">
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <DetailRow label="Total sick days" value={`${employee.sickDaysTotal} days`} />
            <DetailRow label="Available sick days" value={`${employee.sickDaysAvailable} days`} />
          </dl>
        </SectionCard>

        {/* Additional emails */}
        <SectionCard title="Additional emails">
          {employee.emails.length === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No additional emails.</p>
          ) : (
            <ul className="space-y-2">
              {employee.emails.map((em: EmployeeEmail) => (
                <li key={em.id} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-sm text-neutral-900 dark:text-neutral-100">{em.email}</span>
                    {em.label && (
                      <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">({em.label})</span>
                    )}
                  </div>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(em.id)}
                      className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Remove email"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canUpdate && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setAddEmailOpen(true)}
            >
              + Add email
            </Button>
          )}
        </SectionCard>

        {/* Managers */}
        <SectionCard title="Managers">
          {employee.managers.length === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No managers assigned.</p>
          ) : (
            <ul className="space-y-2">
              {employee.managers.map((mgr: EmployeeManager) => (
                <li key={mgr.id} className="flex items-center justify-between gap-2">
                  <div>
                    <Link
                      to={ROUTES.EMPLOYEE_DETAIL.replace(":id", mgr.id)}
                      className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {mgr.firstName} {mgr.lastName}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">{mgr.email}</span>
                  </div>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => handleRemoveManager(mgr.id)}
                      className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Remove manager"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canUpdate && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setAddManagerOpen(true)}
            >
              + Add manager
            </Button>
          )}
        </SectionCard>

        {/* Linked user account */}
        <SectionCard title="Platform user account">
          {employee.linkedUser ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                    {employee.linkedUser.name ?? employee.linkedUser.email}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">{employee.linkedUser.email}</p>
                </div>
              </div>
              {canUpdate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnlinkConfirmOpen(true)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  Unlink account
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                No platform user account linked.
              </p>
              {canUpdate && (
                <Button variant="ghost" size="sm" onClick={() => setLinkUserOpen(true)}>
                  Link user account
                </Button>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Metadata */}
      <div className="text-xs text-neutral-400 dark:text-neutral-500 flex gap-4">
        <span>Created {formatDate(employee.createdAt)}</span>
        <span>Updated {formatDate(employee.updatedAt)}</span>
      </div>

      {/* Dialogs */}
      <AddEmailDialog
        open={addEmailOpen}
        onClose={() => setAddEmailOpen(false)}
        onAdded={() => { setAddEmailOpen(false); fetchEmployee(); }}
        employeeId={employee.id}
      />
      <AddManagerDialog
        open={addManagerOpen}
        onClose={() => setAddManagerOpen(false)}
        onAdded={() => { fetchEmployee(); }}
        employeeId={employee.id}
        currentManagers={employee.managers}
      />
      <LinkUserDialog
        open={linkUserOpen}
        onClose={() => setLinkUserOpen(false)}
        onLinked={() => { setLinkUserOpen(false); fetchEmployee(); }}
        employeeId={employee.id}
      />

      {/* Unlink confirm */}
      <Dialog
        open={unlinkConfirmOpen}
        onOpenChange={(v) => { if (!v) setUnlinkConfirmOpen(false); }}
        title="Unlink user account"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Are you sure you want to unlink the platform user account from this employee record?
            The user account itself will not be deleted.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setUnlinkConfirmOpen(false)} disabled={isUnlinking}>Cancel</Button>
            <Button variant="danger" onClick={handleUnlink} disabled={isUnlinking}>
              {isUnlinking ? "Unlinking…" : "Unlink"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
