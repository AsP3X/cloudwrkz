import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatDateTime } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getCurrentUserProfile } from "@/server/actions/users";
import { ProfileForm } from "@/components/features/profile/ProfileForm";
import Image from "next/image";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect(ROUTES.DASHBOARD);
  }


  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AGENT":
        return {
          label: "Agent",
          className: "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800",
        };
      case "ADMIN":
        return {
          label: "Admin",
          className: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
        };
      case "MODERATOR":
        return {
          label: "Moderator",
          className: "bg-secondary-100 dark:bg-secondary-900 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-800",
        };
      default:
        return {
          label: "User",
          className: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return {
          label: "Active",
          className: "bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-300 border-success-200 dark:border-success-800",
        };
      case "PENDING":
        return {
          label: "Pending",
          className: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
        };
      case "SUSPENDED":
        return {
          label: "Suspended",
          className: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
        };
      default:
        return {
          label: status,
          className: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
        };
    }
  };

  const roleBadge = getRoleBadge(profile.role);
  const statusBadge = getStatusBadge(profile.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-2xl font-bold text-primary-700 dark:text-primary-300 flex-shrink-0 overflow-hidden">
              {profile.avatar ? (
                <Image
                  src={profile.avatar}
                  alt={profile.name || profile.email}
                  width={80}
                  height={80}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>
                  {(profile.name || profile.email)[0].toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {profile.name || profile.email.split("@")[0]}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${roleBadge.className}`}
                >
                  {roleBadge.label}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400">{profile.email}</p>
              {profile.bio && (
                <p className="text-neutral-700 dark:text-neutral-300 mt-2 max-w-2xl">{profile.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Edit Form */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Edit Profile</h2>
            <ProfileForm
              initialData={{
                name: profile.name,
                bio: profile.bio,
              }}
            />
          </div>
        </div>

        {/* Sidebar - Account Information */}
        <div className="space-y-6">
          {/* Account Information Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">Account Information</h3>
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Email Address
                </label>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">{profile.email}</p>
                {profile.emailVerified ? (
                  <div className="flex items-center gap-1 mt-1">
                    <svg
                      className="w-4 h-4 text-success-500"
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
                    <span className="text-xs text-success-600">Verified</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-1">
                    <svg
                      className="w-4 h-4 text-yellow-500"
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
                    <span className="text-xs text-yellow-600">Not verified</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

              {/* Role */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Role
                </label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${roleBadge.className}`}
                >
                  {roleBadge.label}
                </span>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Status
                </label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

              {/* Timezone */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Timezone
                </label>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {profile.timezone ?? "UTC"}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

              {/* Dates */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Member Since
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTime(profile.createdAt)}
                  </p>
                </div>
                {profile.lastLoginAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Last Login
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">
                      {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "Never"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
