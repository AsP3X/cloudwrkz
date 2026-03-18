import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
import { ProfileCompleteness } from "@/components/features/settings/ProfileCompleteness";
import { formatDateTime } from "@/lib/utils/date";
import { getAvatarUrl } from "@/lib/utils/users";

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

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0];
  const roleBadge = getRoleBadge(user.role);
  const statusBadge = getStatusBadge(user.status);
  const avatarUrl = getAvatarUrl(user.avatar);

  return (
    <div className="space-y-6">
      {/* Header card with gradient accent */}
      <div className="relative overflow-hidden bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-secondary-500/5 to-transparent pointer-events-none" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-2xl font-bold text-primary-700 dark:text-primary-300 flex-shrink-0 overflow-hidden ring-2 ring-white dark:ring-neutral-800 shadow-md">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <span>{displayName[0].toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                    {displayName}
                  </h1>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide border ${roleBadge.className}`}
                  >
                    {roleBadge.label}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide border ${statusBadge.className}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>
                <p className="text-neutral-600 dark:text-neutral-400 text-sm sm:text-base truncate">
                  {user.email}
                </p>
                {user.bio && user.bio.trim().length > 0 && (
                  <p className="text-neutral-600 dark:text-neutral-400 mt-2 text-sm line-clamp-2 max-w-2xl">
                    {user.bio}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 border-t sm:border-t-0 sm:border-l border-neutral-200 dark:border-neutral-700 pt-4 sm:pt-0 sm:pl-6">
              <span className="flex items-center gap-1.5">
                <svg
                  className="w-4 h-4 text-neutral-400"
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
                <span className="flex items-center gap-1.5">
                  <svg
                    className="w-4 h-4 text-neutral-400"
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
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-3">
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
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Profile completeness */}
      <ProfileCompleteness
        hasAvatar={!!user.avatar}
        hasBio={!!(user.bio && user.bio.trim().length > 0)}
        emailVerified={!!user.emailVerified}
        hasCustomTimezone={!!(user.timezone && user.timezone !== "UTC")}
        hasName={!!(user.name && user.name.trim().length > 0)}
      />

      {/* Personal information — collapsible */}
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

      {/* Account overview — read-only details */}
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
        </div>
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
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
