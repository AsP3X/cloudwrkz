import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
import { ProfileCompleteness } from "@/components/features/settings/ProfileCompleteness";
import { formatDateTime } from "@/lib/utils/date";
import { getAvatarUrl } from "@/lib/utils/users";
import { api } from "@/api/client";
import type { Employee, EmployeeStatus } from "@/lib/types";

// Human: Signed-in profile overview with avatar, role/status badges, completeness, employment card, and editable sections.
// Agent: FETCH /employees to find linked employee by linkedUserId; RENDER hero, employment section, ProfileForm, account overview.

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

const SectionIcon = ({ d }: { d: string }) => (
  <svg
    className="w-5 h-5 text-primary-600 dark:text-primary-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

function StatTile({
  value,
  label,
  colorClass,
}: {
  value: number | string;
  label: string;
  colorClass?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-700/60 text-center">
      <span
        className={`text-2xl font-bold tabular-nums leading-none mb-1 ${
          colorClass ?? "text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-tight">
        {label}
      </span>
    </div>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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

// Human: Layout shell: hero, employment card (when linked), personal info form, account overview.
// Agent: FETCH linked employee via /employees search; DERIVE displayName, avatarUrl, badges; CONDITIONAL employment section.

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [linkedEmployee, setLinkedEmployee] = useState<Employee | null>(null);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ employees: Employee[] }>(
        `/employees?search=${encodeURIComponent(user.email)}&limit=20`,
      )
      .then((res) => {
        const match = (res.employees ?? []).find(
          (e) => e.linkedUserId === user.id,
        );
        setLinkedEmployee(match ?? null);
      })
      .catch(() => setLinkedEmployee(null))
      .finally(() => setEmployeeLoading(false));
  }, [user?.id, user?.email]);

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0];
  const roleBadge = getRoleBadge(user.role);
  const statusBadge = getStatusBadge(user.status);
  const avatarUrl = getAvatarUrl(user.avatar);

  const employeeStatusConfig = linkedEmployee
    ? getEmployeeStatusConfig(linkedEmployee.employeeStatus)
    : null;

  const vacationTotal = linkedEmployee
    ? linkedEmployee.vacationAvailable +
      linkedEmployee.vacationUsed +
      linkedEmployee.vacationPlanned
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Hero Card ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800">
        {/* Top gradient accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-secondary-500 to-primary-400" />

        {/* Subtle body gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/[0.03] via-secondary-500/[0.03] to-transparent pointer-events-none" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
            {/* Avatar */}
            <div className="flex-shrink-0 self-start">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-3xl sm:text-4xl font-bold text-primary-700 dark:text-primary-300 overflow-hidden ring-4 ring-white dark:ring-neutral-900 shadow-lg">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full rounded-2xl object-cover"
                    />
                  ) : (
                    <span>{displayName[0].toUpperCase()}</span>
                  )}
                </div>
                {user.status === "ACTIVE" && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-success-500 border-2 border-white dark:border-neutral-900 rounded-full shadow-sm" />
                )}
              </div>
            </div>

            {/* Identity block */}
            <div className="flex-1 min-w-0">
              {/* Name + badges */}
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-tight">
                  {displayName}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${roleBadge.className}`}
                  >
                    {roleBadge.label}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${statusBadge.className}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>
              </div>

              {/* Employment subtitle */}
              {linkedEmployee &&
                (linkedEmployee.title || linkedEmployee.department) && (
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2 flex items-center gap-2">
                    <svg
                      className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    {[linkedEmployee.title, linkedEmployee.department]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

              {/* Email + verification */}
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {user.email}
                </p>
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-950/50 px-1.5 py-0.5 rounded">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/50 px-1.5 py-0.5 rounded">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Unverified
                  </span>
                )}
              </div>

              {/* Bio */}
              {user.bio && user.bio.trim().length > 0 && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 max-w-xl mb-3 italic">
                  &ldquo;{user.bio}&rdquo;
                </p>
              )}

              {/* Meta chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Member since {formatDateTime(user.createdAt).split(",")[0]}
                </span>
                {user.lastLoginAt && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Last login {formatDateTime(user.lastLoginAt).split(",")[0]}
                  </span>
                )}
                {user.timezone && user.timezone !== "UTC" && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"
                      />
                    </svg>
                    {user.timezone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions footer */}
          <div className="mt-5 pt-5 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-4">
            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Account Settings
            </Link>
          </div>
        </div>
      </div>

      {/* ── Profile completeness ─────────────────────────────────────────── */}
      <ProfileCompleteness
        hasAvatar={!!user.avatar}
        hasBio={!!(user.bio && user.bio.trim().length > 0)}
        emailVerified={!!user.emailVerified}
        hasCustomTimezone={!!(user.timezone && user.timezone !== "UTC")}
        hasName={!!(user.name && user.name.trim().length > 0)}
      />

      {/* ── Employment information ───────────────────────────────────────── */}
      {!employeeLoading && linkedEmployee && (
        <CollapsibleSection
          title="Employment"
          description="Your employment details, leave balances, and reporting structure"
          icon={
            <SectionIcon d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          }
          defaultExpanded={true}
        >
          <div className="space-y-6">
            {/* Status badge + role */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${employeeStatusConfig!.className}`}
              >
                {employeeStatusConfig!.label}
              </span>
              {linkedEmployee.companyRole && (
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {linkedEmployee.companyRole}
                </span>
              )}
            </div>

            {/* Info grid: title / department / company role */}
            {(linkedEmployee.title ||
              linkedEmployee.department ||
              linkedEmployee.companyRole) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-700/60">
                {linkedEmployee.title && (
                  <InfoField label="Job Title" value={linkedEmployee.title} />
                )}
                {linkedEmployee.department && (
                  <InfoField
                    label="Department"
                    value={linkedEmployee.department}
                  />
                )}
                {linkedEmployee.companyRole && (
                  <InfoField
                    label="Company Role"
                    value={linkedEmployee.companyRole}
                  />
                )}
              </div>
            )}

            {/* Leave balances */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-primary-500 dark:text-primary-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Leave Balances
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile
                  value={linkedEmployee.vacationAvailable}
                  label="Vacation Available"
                  colorClass="text-success-600 dark:text-success-400"
                />
                <StatTile
                  value={linkedEmployee.vacationUsed}
                  label="Vacation Used"
                  colorClass="text-neutral-700 dark:text-neutral-200"
                />
                <StatTile
                  value={linkedEmployee.vacationPlanned}
                  label="Vacation Planned"
                  colorClass="text-primary-600 dark:text-primary-400"
                />
                <StatTile
                  value={`${linkedEmployee.sickDaysAvailable} / ${linkedEmployee.sickDaysTotal}`}
                  label="Sick Days Left"
                  colorClass="text-secondary-600 dark:text-secondary-400"
                />
              </div>

              {/* Vacation usage progress bar */}
              {vacationTotal > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                    <span>Vacation usage</span>
                    <span>
                      {linkedEmployee.vacationUsed} / {vacationTotal} days
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((linkedEmployee.vacationUsed / vacationTotal) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Managers */}
            {linkedEmployee.managers.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-primary-500 dark:text-primary-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {linkedEmployee.managers.length === 1
                    ? "Manager"
                    : "Managers"}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {linkedEmployee.managers.map((manager) => (
                    <div
                      key={manager.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 rounded-xl hover:border-primary-200 dark:hover:border-primary-700 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 flex-shrink-0">
                        {manager.firstName[0]}
                        {manager.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
                          {manager.firstName} {manager.lastName}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {manager.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional emails */}
            {linkedEmployee.emails.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-primary-500 dark:text-primary-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  Additional Emails
                </h3>
                <div className="flex flex-wrap gap-2">
                  {linkedEmployee.emails.map((email) => (
                    <div
                      key={email.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 rounded-lg text-sm"
                    >
                      <span className="text-neutral-800 dark:text-neutral-200">
                        {email.email}
                      </span>
                      {email.label && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                          {email.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Personal information ─────────────────────────────────────────── */}
      <CollapsibleSection
        title="Personal information"
        description="Update your display name and bio"
        icon={
          <SectionIcon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        }
        defaultExpanded={true}
      >
        <ProfileForm
          initialData={{
            name: user.name,
            bio: user.bio,
          }}
          onSaved={refreshUser}
        />
      </CollapsibleSection>

      {/* ── Account overview ─────────────────────────────────────────────── */}
      <CollapsibleSection
        title="Account overview"
        description="Your account details and verification status"
        icon={
          <SectionIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        }
        defaultExpanded={false}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Email address
            </span>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {user.email}
            </p>
            {user.emailVerified ? (
              <div className="flex items-center gap-1.5 mt-1.5 text-success-600 dark:text-success-400 text-xs font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Verified
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1.5 text-yellow-600 dark:text-yellow-400 text-xs font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                Not verified
              </div>
            )}
          </div>
          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Timezone
            </span>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {user.timezone ?? "UTC"}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Role
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${roleBadge.className}`}
            >
              {roleBadge.label}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Status
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>
          {user.createdAt && (
            <div>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
                Member since
              </span>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {formatDateTime(user.createdAt)}
              </p>
            </div>
          )}
          {user.lastLoginAt && (
            <div>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
                Last login
              </span>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {formatDateTime(user.lastLoginAt)}
              </p>
            </div>
          )}
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
      </CollapsibleSection>
    </div>
  );
}
