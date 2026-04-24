import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatDateTime } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getCurrentUserProfile } from "@/server/actions/users";
import { getAvatarUrl } from "@/lib/utils/users";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ProfileCompleteness } from "@/components/features/settings/ProfileCompleteness/ProfileCompleteness";
import Image from "next/image";
import Link from "next/link";

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

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect(ROUTES.DASHBOARD);
  }

  const roleBadge = getRoleBadge(profile.role);
  const statusBadge = getStatusBadge(profile.status);
  const displayName = profile.name || profile.email.split("@")[0];
  const avatarUrl = getAvatarUrl(profile.avatar);

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
                    <Image
                      src={avatarUrl}
                      alt={displayName}
                      width={96}
                      height={96}
                      className="w-full h-full rounded-2xl object-cover"
                    />
                  ) : (
                    <span>{displayName[0].toUpperCase()}</span>
                  )}
                </div>
                {profile.status === "ACTIVE" && (
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

              {/* Email + verification */}
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {profile.email}
                </p>
                {profile.emailVerified ? (
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
              {profile.bio && profile.bio.trim().length > 0 && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 max-w-xl mb-3 italic">
                  &ldquo;{profile.bio}&rdquo;
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
                  Member since {formatDateTime(profile.createdAt).split(",")[0]}
                </span>
                {profile.lastLoginAt && (
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
                    Last login{" "}
                    {formatDateTime(profile.lastLoginAt).split(",")[0]}
                  </span>
                )}
                {profile.timezone && profile.timezone !== "UTC" && (
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
                    {profile.timezone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions footer */}
          <div className="mt-5 pt-5 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-4">
            <Link
              href="/dashboard/settings"
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
        hasAvatar={!!profile.avatar}
        hasBio={!!(profile.bio && profile.bio.trim().length > 0)}
        emailVerified={!!profile.emailVerified}
        hasCustomTimezone={!!(profile.timezone && profile.timezone !== "UTC")}
        hasName={!!(profile.name && profile.name.trim().length > 0)}
      />

      {/* ── Personal information ─────────────────────────────────────────── */}
      <CollapsibleSection
        title="Personal information"
        description="Update your display name and bio"
        icon={
          <svg
            className="w-5 h-5 text-primary-600 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        }
        defaultExpanded={true}
      >
        <ProfileForm
          initialData={{
            name: profile.name,
            bio: profile.bio,
          }}
        />
      </CollapsibleSection>

      {/* ── Account overview ─────────────────────────────────────────────── */}
      <CollapsibleSection
        title="Account overview"
        description="Your account details and verification status"
        icon={
          <svg
            className="w-5 h-5 text-primary-600 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        }
        defaultExpanded={false}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Email address
            </span>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {profile.email}
            </p>
            {profile.emailVerified ? (
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
              {profile.timezone ?? "UTC"}
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

          <div>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
              Member since
            </span>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {formatDateTime(profile.createdAt)}
            </p>
          </div>

          {profile.lastLoginAt && (
            <div>
              <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2 block">
                Last login
              </span>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {formatDateTime(profile.lastLoginAt)}
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
          To change email, password, or other account settings, go to{" "}
          <Link
            href="/dashboard/settings"
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
