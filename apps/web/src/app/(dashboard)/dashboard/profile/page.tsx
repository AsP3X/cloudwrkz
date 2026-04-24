import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatDateTime } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getCurrentUserProfile } from "@/server/actions/users";
import { getAvatarUrl } from "@/lib/utils/users";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
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
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-12">
        <section className="xl:col-span-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft-lg overflow-hidden">
          <div className="px-6 sm:px-8 py-7 bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-500 text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">Profile Command Center</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold leading-tight">{displayName}</h1>
            <p className="mt-2 text-sm sm:text-base text-white/80 max-w-2xl">All key identity and account information in one clean control surface.</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
                <div className="w-full h-full rounded-2xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden ring-4 ring-white dark:ring-neutral-900 shadow-lg flex items-center justify-center text-3xl font-bold text-primary-700 dark:text-primary-300">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={displayName} width={96} height={96} className="w-full h-full object-cover" />
                  ) : (
                    <span>{displayName[0].toUpperCase()}</span>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${roleBadge.className}`}>{roleBadge.label}</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${statusBadge.className}`}>{statusBadge.label}</span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{profile.email}</p>
                {profile.bio && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">{profile.bio}</p>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">Member since {formatDateTime(profile.createdAt).split(",")[0]}</span>
                  {profile.lastLoginAt && <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">Last login {formatDateTime(profile.lastLoginAt).split(",")[0]}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
        <aside className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Quick actions</h2>
            <div className="mt-4 space-y-2 text-sm">
              <Link href="/dashboard/settings" className="block rounded-lg px-3 py-2 bg-neutral-50 dark:bg-neutral-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-neutral-700 dark:text-neutral-200">Open account settings</Link>
            </div>
          </div>
          <ProfileCompleteness
            hasAvatar={!!profile.avatar}
            hasBio={!!(profile.bio && profile.bio.trim().length > 0)}
            emailVerified={!!profile.emailVerified}
            hasCustomTimezone={!!(profile.timezone && profile.timezone !== "UTC")}
            hasName={!!(profile.name && profile.name.trim().length > 0)}
          />
        </aside>
      </div>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Employment</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Employment details are reflected here when linked in the employee module.</p>
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500 dark:text-neutral-400">
          This deployment does not expose linked employment data directly in the Next.js profile source yet.
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Personal Information</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 mb-6">Edit your display details used across the platform.</p>
        <ProfileForm
          initialData={{
            name: profile.name,
            bio: profile.bio,
          }}
        />
      </section>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-5">Account Overview</h2>
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
      </section>
    </div>
  );
}
