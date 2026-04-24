import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
import { ProfileCompleteness } from "@/components/features/settings/ProfileCompleteness";
import { formatDateTime } from "@/lib/utils/date";
import { getAvatarUrl } from "@/lib/utils/users";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { Employee, EmployeeStatus } from "@/lib/types";

// Human: Signed-in profile overview with avatar, role/status badges, completeness, and editable sections.
// Agent: FETCH /employees/me; RENDER hero stats + account details in command center, button opens EmploymentDetailsDialog.

function getRoleBadge(role: string) {
  switch (role) {
    case "AGENT":
      return {
        label: "Agent",
        className:
          "bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800",
      };
    case "ADMIN":
      return {
        label: "Admin",
        className:
          "bg-error-100 dark:bg-error-900/60 text-error-700 dark:text-error-300 border border-error-200 dark:border-error-800",
      };
    case "MODERATOR":
      return {
        label: "Moderator",
        className:
          "bg-secondary-100 dark:bg-secondary-900/60 text-secondary-700 dark:text-secondary-300 border border-secondary-200 dark:border-secondary-800",
      };
    default:
      return {
        label: "User",
        className:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700",
      };
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Active",
        className:
          "bg-success-100 dark:bg-success-900/60 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800",
      };
    case "PENDING":
      return {
        label: "Pending",
        className:
          "bg-yellow-100 dark:bg-yellow-900/60 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
      };
    case "SUSPENDED":
      return {
        label: "Suspended",
        className:
          "bg-error-100 dark:bg-error-900/60 text-error-700 dark:text-error-300 border border-error-200 dark:border-error-800",
      };
    default:
      return {
        label: status,
        className:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700",
      };
  }
}

function getEmployeeStatusConfig(status: EmployeeStatus) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Active",
        className:
          "bg-success-100 dark:bg-success-900/60 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800",
      };
    case "INACTIVE":
      return {
        label: "Inactive",
        className:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700",
      };
    case "ON_LEAVE":
      return {
        label: "On Leave",
        className:
          "bg-yellow-100 dark:bg-yellow-900/60 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800",
      };
    case "PROBATION":
      return {
        label: "Probation",
        className:
          "bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800",
      };
    case "TERMINATED":
      return {
        label: "Terminated",
        className:
          "bg-error-100 dark:bg-error-900/60 text-error-700 dark:text-error-300 border border-error-200 dark:border-error-800",
      };
    default:
      return {
        label: status,
        className:
          "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700",
      };
  }
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
        {label}
      </span>
      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
    </div>
  );
}

function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

// Human: Modal body for linked employee: identity, work contact, org, time off, managers, optional compensation.
// Agent: RENDER from Employee; vacation bar when vacationTotal > 0.

function EmploymentDetailsDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Employment details"
      description={
        employee
          ? "Information from your linked employee record."
          : "Your account's employment link status."
      }
      className="sm:max-w-lg"
    >
      {employee == null ? (
        <div className="px-5 sm:px-7 py-5 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            No employment record is linked to your account. If you expect to see a profile here, ask
            an administrator to link your user to an employee record.
          </p>
          <div className="flex justify-end pt-1">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <EmploymentDetailsDialogBody employee={employee} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  );
}

function EmploymentDetailsDialogBody({
  employee,
  onOpenChange,
}: {
  employee: Employee;
  onOpenChange: (open: boolean) => void;
}) {
  const statusCfg = getEmployeeStatusConfig(employee.employeeStatus);
  const vacationTotal =
    employee.vacationAvailable + employee.vacationUsed + employee.vacationPlanned;
  const usedPct =
    vacationTotal > 0
      ? Math.min(100, Math.round((employee.vacationUsed / vacationTotal) * 100))
      : 0;

  return (
    <div className="px-5 sm:px-7 py-4 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {employee.firstName} {employee.lastName}
          </p>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${statusCfg.className}`}
          >
            {statusCfg.label}
          </span>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Work contact
          </h3>
          <InfoField label="Work email" value={employee.email} />
          {employee.emails && employee.emails.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
                Additional emails
              </span>
              <ul className="text-sm text-neutral-800 dark:text-neutral-200 space-y-1.5">
                {employee.emails.map((e) => (
                  <li key={e.id}>
                    {e.email}
                    {e.label ? (
                      <span className="text-neutral-500 dark:text-neutral-400"> ({e.label})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {"Role & organization"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {employee.title && <InfoField label="Job title" value={employee.title} />}
            {employee.department && <InfoField label="Department" value={employee.department} />}
            <InfoField label="Company role" value={employee.companyRole || "—"} />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Time off
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{employee.vacationAvailable}</p>
              <p className="text-xs text-neutral-500">Vacation available</p>
            </div>
            <div className="rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{employee.vacationUsed}</p>
              <p className="text-xs text-neutral-500">Vacation used</p>
            </div>
            <div className="rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{employee.vacationPlanned}</p>
              <p className="text-xs text-neutral-500">Vacation planned</p>
            </div>
            <div className="rounded-lg p-2.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              <p className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {employee.sickDaysAvailable}/{employee.sickDaysTotal}
              </p>
              <p className="text-xs text-neutral-500">Sick days (avail. / total)</p>
            </div>
          </div>
          {vacationTotal > 0 && (
            <div>
              <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                <span>Vacation usage</span>
                <span>
                  {employee.vacationUsed} / {vacationTotal} days
                </span>
              </div>
              <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-secondary-500"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {"Compensation & hours"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoField label="Monthly salary" value={formatMoney(employee.monthlySalary)} />
            <InfoField label="Monthly expenses" value={formatMoney(employee.monthlyExpenses)} />
            <InfoField
              label="Hours worked"
              value={employee.hoursWorked != null ? String(employee.hoursWorked) : "—"}
            />
          </div>
        </div>

        {employee.managers && employee.managers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Managers
            </h3>
            <ul className="text-sm space-y-2">
              {employee.managers.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 bg-neutral-50/80 dark:bg-neutral-800/40"
                >
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {m.firstName} {m.lastName}
                  </span>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{m.email}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1 flex justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
    </div>
  );
}

// Human: Layout shell: account command center (employment CTA + account details), dialog, and personal info.
// Agent: FETCH /employees/me; always show CTA after load; EmploymentDetailsDialog for linked or empty state.

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [linkedEmployee, setLinkedEmployee] = useState<Employee | null>(null);
  const [employeeLoading, setEmployeeLoading] = useState(true);
  const [employmentOpen, setEmploymentOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ employee: Employee | null }>("/employees/me")
      .then((res) => setLinkedEmployee(res.employee ?? null))
      .catch(() => setLinkedEmployee(null))
      .finally(() => setEmployeeLoading(false));
  }, [user?.id]);

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0];
  const roleBadge = getRoleBadge(user.role);
  const statusBadge = getStatusBadge(user.status);
  const avatarUrl = getAvatarUrl(user.avatar);

  const profileScore = useMemo(() => {
    const checks = [
      !!user.name?.trim(),
      !!user.avatar,
      !!user.bio?.trim(),
      !!user.emailVerified,
      !!(user.timezone && user.timezone !== "UTC"),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [user.avatar, user.bio, user.emailVerified, user.name, user.timezone]);
  const memberSince = formatDateTime(user.createdAt).split(",")[0];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-12">
        <section className="xl:col-span-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft-lg overflow-hidden">
          <div className="px-6 sm:px-8 py-7 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Account command center</p>
                <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">{displayName}</h1>
                <p className="mt-2 text-sm sm:text-base text-white/80 max-w-2xl">
                  Your identity and account health in one place.
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-stretch sm:items-end justify-center gap-1">
                {employeeLoading ? (
                  <span className="text-sm text-white/80 py-2 sm:py-0">Checking employment link…</span>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    className="!bg-white !text-primary-800 shadow-sm hover:!bg-white/95 dark:!bg-white dark:!text-primary-900"
                    onClick={() => setEmploymentOpen(true)}
                  >
                    View employment details
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
                <div className="w-full h-full rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-4 ring-white dark:ring-neutral-900 shadow-lg flex items-center justify-center text-3xl font-bold text-primary-700 dark:text-primary-300">
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" /> : <span>{displayName[0].toUpperCase()}</span>}
                </div>
                {user.status === "ACTIVE" && <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-success-500 border-2 border-white dark:border-neutral-900 rounded-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${roleBadge.className}`}>{roleBadge.label}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${statusBadge.className}`}>{statusBadge.label}</span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{user.email}</p>
                {user.bio && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">{user.bio}</p>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">Member since {memberSince}</span>
                  {user.lastLoginAt && (
                    <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      Last login {formatDateTime(user.lastLoginAt).split(",")[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-800/50">
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{profileScore}%</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Profile health</p>
              </div>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-800/50">
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{user.emailVerified ? "Yes" : "No"}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Email verified</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <InfoField label="Timezone" value={user.timezone ?? "UTC"} />
              <InfoField
                label="Member since"
                value={user.createdAt ? formatDateTime(user.createdAt) : "—"}
              />
              <InfoField label="Role" value={roleBadge.label} />
              <InfoField label="Status" value={statusBadge.label} />
              <InfoField
                label="Last login"
                value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
              />
            </div>
            <p className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
              To change email, password, or other account settings, go to{" "}
              <Link
                to="/dashboard/settings"
                className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        </section>
        <aside className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Quick actions</h2>
            <div className="mt-4 space-y-2 text-sm">
              <Link to="/dashboard/settings" className="block rounded-lg px-3 py-2 bg-neutral-50 dark:bg-neutral-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-neutral-700 dark:text-neutral-200">Open account settings</Link>
              <Link to="/dashboard/settings/security" className="block rounded-lg px-3 py-2 bg-neutral-50 dark:bg-neutral-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-neutral-700 dark:text-neutral-200">Review security settings</Link>
            </div>
          </div>
          <ProfileCompleteness
            hasAvatar={!!user.avatar}
            hasBio={!!(user.bio && user.bio.trim().length > 0)}
            emailVerified={!!user.emailVerified}
            hasCustomTimezone={!!(user.timezone && user.timezone !== "UTC")}
            hasName={!!(user.name && user.name.trim().length > 0)}
          />
        </aside>
      </div>

      <EmploymentDetailsDialog
        open={employmentOpen}
        onOpenChange={setEmploymentOpen}
        employee={linkedEmployee}
      />

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Personal Information</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 mb-6">Edit your display details used across the platform.</p>
        <ProfileForm
          initialData={{
            name: user.name,
            bio: user.bio,
          }}
          onSaved={refreshUser}
        />
      </section>
    </div>
  );
}
