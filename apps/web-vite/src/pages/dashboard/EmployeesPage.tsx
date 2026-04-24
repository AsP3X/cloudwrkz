// Human: Employee register for admins and users; list with search/status filter, full CRUD dialogs, and
//        optional user-account creation/linking on employee creation.
// Agent: FETCH /employees; STATE dialogs; user-account flow check-email -> warn -> link or create; OverviewContextMenu.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { ROUTES } from "@/lib/constants/routes";
import type { Employee, EmployeeStatus } from "@/lib/types";

const EMPLOYEE_STATUSES: EmployeeStatus[] = ["ACTIVE", "INACTIVE", "ON_LEAVE", "PROBATION", "TERMINATED"];

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_LEAVE: "On Leave",
  PROBATION: "Probation",
  TERMINATED: "Terminated",
};

const getStatusBadgeVariant = (status: string) => {
  switch (status as EmployeeStatus) {
    case "ACTIVE": return "success" as const;
    case "PROBATION": return "warning" as const;
    case "ON_LEAVE": return "info" as const;
    case "INACTIVE": return "default" as const;
    case "TERMINATED": return "error" as const;
    default: return "default" as const;
  }
};

// ---------------------------------------------------------------------------
// Employee form fields shared between Create and Edit dialogs
// ---------------------------------------------------------------------------

interface EmployeeFormData {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  employeeStatus: EmployeeStatus;
  companyRole: string;
  department: string;
  monthlySalary: string;
  monthlyExpenses: string;
  hoursWorked: string;
  vacationAvailable: string;
  vacationUsed: string;
  vacationPlanned: string;
  sickDaysTotal: string;
  sickDaysAvailable: string;
}

const EMPTY_FORM: EmployeeFormData = {
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  employeeStatus: "ACTIVE",
  companyRole: "",
  department: "",
  monthlySalary: "",
  monthlyExpenses: "",
  hoursWorked: "",
  vacationAvailable: "0",
  vacationUsed: "0",
  vacationPlanned: "0",
  sickDaysTotal: "0",
  sickDaysAvailable: "0",
};

function formFromEmployee(e: Employee): EmployeeFormData {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    title: e.title ?? "",
    employeeStatus: e.employeeStatus,
    companyRole: e.companyRole ?? "",
    department: e.department ?? "",
    monthlySalary: e.monthlySalary != null ? String(e.monthlySalary) : "",
    monthlyExpenses: e.monthlyExpenses != null ? String(e.monthlyExpenses) : "",
    hoursWorked: e.hoursWorked != null ? String(e.hoursWorked) : "",
    vacationAvailable: String(e.vacationAvailable),
    vacationUsed: String(e.vacationUsed),
    vacationPlanned: String(e.vacationPlanned),
    sickDaysTotal: String(e.sickDaysTotal),
    sickDaysAvailable: String(e.sickDaysAvailable),
  };
}

// ---------------------------------------------------------------------------
// EmployeeFormFields — reusable fields block
// ---------------------------------------------------------------------------

function EmployeeFormFields({
  form,
  onChange,
}: {
  form: EmployeeFormData;
  onChange: (patch: Partial<EmployeeFormData>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Jane"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Smith"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="jane.smith@company.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Title</label>
          <Input
            value={form.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Senior Engineer"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
          <Select
            value={form.employeeStatus}
            onChange={(e) => onChange({ employeeStatus: e.target.value as EmployeeStatus })}
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Role within company</label>
          <Input
            value={form.companyRole}
            onChange={(e) => onChange({ companyRole: e.target.value })}
            placeholder="Frontend Developer"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Department <span className="text-neutral-400 text-xs">(placeholder)</span>
          </label>
          <Input
            value={form.department}
            onChange={(e) => onChange({ department: e.target.value })}
            placeholder="Engineering"
          />
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
          Financial
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Monthly salary <span className="text-neutral-400 text-xs">(€)</span>
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.monthlySalary}
              onChange={(e) => onChange({ monthlySalary: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Monthly expenses <span className="text-neutral-400 text-xs">(placeholder)</span>
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.monthlyExpenses}
              onChange={(e) => onChange({ monthlyExpenses: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      <section className="border-t border-neutral-200 dark:border-neutral-700 pt-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            Vacation & sick leave
          </p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            Keep leave balances structured and easy to review.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 p-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
              Vacation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Available</label>
                <Input type="number" min="0" value={form.vacationAvailable} onChange={(e) => onChange({ vacationAvailable: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Used</label>
                <Input type="number" min="0" value={form.vacationUsed} onChange={(e) => onChange({ vacationUsed: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Planned</label>
                <Input type="number" min="0" value={form.vacationPlanned} onChange={(e) => onChange({ vacationPlanned: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/60 p-4 space-y-3">
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wide">
              Sick leave
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Total</label>
                <Input type="number" min="0" value={form.sickDaysTotal} onChange={(e) => onChange({ sickDaysTotal: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Available</label>
                <Input type="number" min="0" value={form.sickDaysAvailable} onChange={(e) => onChange({ sickDaysAvailable: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkExistingUserDialog — shown when a user account already exists during create
// ---------------------------------------------------------------------------

interface ExistingUser {
  id: string;
  email: string;
  name: string | null;
}

function LinkExistingUserDialog({
  open,
  existingUser,
  onLink,
  onCancel,
  isLoading,
}: {
  open: boolean;
  existingUser: ExistingUser | null;
  onLink: (userId: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  if (!existingUser) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
      title="User account already exists"
      className="max-w-lg sm:max-w-lg"
    >
      <div className="px-6 pb-6 pt-2 space-y-5">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            A platform user account already exists for this email address.
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            <strong>{existingUser.email}</strong>
            {existingUser.name ? ` (${existingUser.name})` : ""}
          </p>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Do you want to link this existing account with the new employee record? The account will
          not be modified.
        </p>
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => onLink(existingUser.id)} disabled={isLoading}>
            {isLoading ? "Linking…" : "Link account"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CreateEmployeeDialog
// ---------------------------------------------------------------------------

function CreateEmployeeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<EmployeeFormData>(EMPTY_FORM);
  const [createUserAccount, setCreateUserAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User-account conflict flow
  const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  const patch = (p: Partial<EmployeeFormData>) => setForm((f) => ({ ...f, ...p }));

  const buildPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim().toLowerCase(),
    title: form.title.trim() || undefined,
    employeeStatus: form.employeeStatus,
    companyRole: form.companyRole.trim() || undefined,
    department: form.department.trim() || undefined,
    monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : undefined,
    monthlyExpenses: form.monthlyExpenses ? parseFloat(form.monthlyExpenses) : undefined,
    hoursWorked: form.hoursWorked ? parseFloat(form.hoursWorked) : undefined,
    vacationAvailable: parseInt(form.vacationAvailable, 10) || 0,
    vacationUsed: parseInt(form.vacationUsed, 10) || 0,
    vacationPlanned: parseInt(form.vacationPlanned, 10) || 0,
    sickDaysTotal: parseInt(form.sickDaysTotal, 10) || 0,
    sickDaysAvailable: parseInt(form.sickDaysAvailable, 10) || 0,
    ...overrides,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("First name, last name and email are required.");
      return;
    }

    setIsLoading(true);
    try {
      if (createUserAccount) {
        // Check if a user account already exists
        const check = await api.get<{ exists: boolean; user: ExistingUser | null }>(
          `/employees/check-email?email=${encodeURIComponent(form.email.trim())}`,
        );
        if (check.exists && check.user) {
          // Show link-existing-user dialog
          setExistingUser(check.user);
          setPendingPayload(buildPayload({ createUserAccount: false }));
          setLinkDialogOpen(true);
          setIsLoading(false);
          return;
        }
      }

      await api.post("/employees", buildPayload({ createUserAccount }));
      onCreated();
      setForm(EMPTY_FORM);
      setCreateUserAccount(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create employee. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkExisting = async (userId: string) => {
    if (!pendingPayload) return;
    setIsLoading(true);
    try {
      await api.post("/employees", { ...pendingPayload, linkExistingUserId: userId });
      setLinkDialogOpen(false);
      setExistingUser(null);
      setPendingPayload(null);
      onCreated();
      setForm(EMPTY_FORM);
      setCreateUserAccount(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create employee. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setForm(EMPTY_FORM);
    setCreateUserAccount(false);
    setError(null);
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) handleClose();
        }}
        title="Create employee"
        className="max-w-3xl sm:max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
          <section className="space-y-4">
            <EmployeeFormFields form={form} onChange={patch} />
          </section>

          {/* User account creation option */}
          <section className="border-t border-neutral-200 dark:border-neutral-800 pt-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createUserAccount}
                onChange={(e) => setCreateUserAccount(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className="font-medium">Create platform user account</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Automatically creates a user account with this email. If an account already exists
                  you'll be prompted to link it instead.
                </span>
              </span>
            </label>
          </section>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating…" : "Create employee"}
            </Button>
          </div>
        </form>
      </Dialog>

      <LinkExistingUserDialog
        open={linkDialogOpen}
        existingUser={existingUser}
        onLink={handleLinkExisting}
        onCancel={() => {
          setLinkDialogOpen(false);
          setExistingUser(null);
          setPendingPayload(null);
        }}
        isLoading={isLoading}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// EditEmployeeDialog
// ---------------------------------------------------------------------------

function EditEmployeeDialog({
  open,
  employee,
  onClose,
  onSaved,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EmployeeFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (employee) setForm(formFromEmployee(employee));
  }, [employee]);

  const patch = (p: Partial<EmployeeFormData>) => setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setError(null);
    setIsLoading(true);
    try {
      await api.patch(`/employees/${employee.id}`, {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        title: form.title.trim() || undefined,
        employeeStatus: form.employeeStatus,
        companyRole: form.companyRole.trim() || undefined,
        department: form.department.trim() || undefined,
        monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : null,
        monthlyExpenses: form.monthlyExpenses ? parseFloat(form.monthlyExpenses) : null,
        hoursWorked: form.hoursWorked ? parseFloat(form.hoursWorked) : null,
        vacationAvailable: parseInt(form.vacationAvailable, 10) || 0,
        vacationUsed: parseInt(form.vacationUsed, 10) || 0,
        vacationPlanned: parseInt(form.vacationPlanned, 10) || 0,
        sickDaysTotal: parseInt(form.sickDaysTotal, 10) || 0,
        sickDaysAvailable: parseInt(form.sickDaysAvailable, 10) || 0,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      title="Edit employee"
      className="max-w-3xl sm:max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
        <section className="space-y-4">
          <EmployeeFormFields form={form} onChange={patch} />
        </section>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DeleteEmployeeDialog
// ---------------------------------------------------------------------------

function DeleteEmployeeDialog({
  open,
  employee,
  onClose,
  onDeleted,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (!employee) return;
    setIsLoading(true);
    try {
      await api.delete(`/employees/${employee.id}`);
      onDeleted();
    } catch { /* ignore */ }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Delete employee"
      className="max-w-lg sm:max-w-lg"
    >
      <div className="px-6 pb-6 pt-2 space-y-5">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Are you sure you want to delete{" "}
          <strong>
            {employee?.firstName} {employee?.lastName}
          </strong>
          ? This action cannot be undone.
        </p>
        {employee?.linkedUserId && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            This employee is linked to a platform user account. Deleting the employee record will
            not delete the user account.
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// EmployeesPage
// ---------------------------------------------------------------------------

export default function EmployeesPage() {
  const { can, permissions } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; emp: Employee } | null>(null);

  const caps = useMemo(() => {
    if (permissions.length === 0) {
      return { canCreate: true, canUpdate: true, canDelete: true };
    }
    return {
      canCreate: can("employees.create"),
      canUpdate: can("employees.update"),
      canDelete: can("employees.delete"),
    };
  }, [permissions, can]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("page", String(page));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api.get<{
        employees: Employee[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/employees?${params.toString()}`);
      setEmployees(data.employees ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const getContextMenuItems = useCallback(
    (emp: Employee): OverviewContextMenuItem[] => {
      const items: OverviewContextMenuItem[] = [
        {
          id: "view",
          label: "View details",
          onClick: () => navigate(ROUTES.EMPLOYEE_DETAIL.replace(":id", emp.id)),
        },
      ];
      if (caps.canUpdate) {
        items.push({
          id: "edit",
          label: "Edit",
          onClick: () => {
            setSelectedEmployee(emp);
            setEditOpen(true);
          },
        });
      }
      if (caps.canDelete) {
        items.push({
          id: "delete",
          label: "Delete",
          onClick: () => {
            setSelectedEmployee(emp);
            setDeleteOpen(true);
          },
          destructive: true,
          separatorAbove: true,
        });
      }
      return items;
    },
    [navigate, caps],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Employees</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {total > 0 ? `${total} employee${total === 1 ? "" : "s"}` : "No employees yet"}
          </p>
        </div>
        {caps.canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New employee
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="flex-1"
          placeholder="Search by name, email, role…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-primary-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : employees.length === 0 ? (
          <div className="py-20 text-center text-neutral-500 dark:text-neutral-400 text-sm">
            {search || statusFilter ? "No employees match your filters." : "No employees yet. Create one to get started."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Role / Dept.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Account</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.EMPLOYEE_DETAIL.replace(":id", emp.id))}
                        className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 text-left"
                      >
                        {emp.firstName} {emp.lastName}
                      </button>
                      {emp.title && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{emp.title}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 text-xs">{emp.email}</td>
                    <td className="px-4 py-3">
                      <p className="text-neutral-700 dark:text-neutral-300 text-xs">{emp.companyRole ?? "—"}</p>
                      {emp.department && (
                        <p className="text-neutral-400 dark:text-neutral-500 text-xs">{emp.department}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusBadgeVariant(emp.employeeStatus)}>
                        {STATUS_LABELS[emp.employeeStatus] ?? emp.employeeStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {emp.linkedUserId ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Linked
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, emp });
                        }}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800 px-4 py-3">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getContextMenuItems(contextMenu.emp) : []}
      />

      {/* Dialogs */}
      <CreateEmployeeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); fetchEmployees(); }}
      />
      <EditEmployeeDialog
        open={editOpen}
        employee={selectedEmployee}
        onClose={() => { setEditOpen(false); setSelectedEmployee(null); }}
        onSaved={() => { setEditOpen(false); setSelectedEmployee(null); fetchEmployees(); }}
      />
      <DeleteEmployeeDialog
        open={deleteOpen}
        employee={selectedEmployee}
        onClose={() => { setDeleteOpen(false); setSelectedEmployee(null); }}
        onDeleted={() => { setDeleteOpen(false); setSelectedEmployee(null); fetchEmployees(); }}
      />
    </div>
  );
}
