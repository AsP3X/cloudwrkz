import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getCurrentUserProfile } from "@/server/actions/users";
import { ProfileForm } from "@/components/features/profile/ProfileForm";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect(ROUTES.DASHBOARD);
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AGENT":
        return {
          label: "Agent",
          className: "bg-primary-100 text-primary-700 border-primary-200",
        };
      case "ADMIN":
        return {
          label: "Admin",
          className: "bg-error-100 text-error-700 border-error-200",
        };
      case "MODERATOR":
        return {
          label: "Moderator",
          className: "bg-secondary-100 text-secondary-700 border-secondary-200",
        };
      default:
        return {
          label: "User",
          className: "bg-neutral-100 text-neutral-700 border-neutral-200",
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return {
          label: "Active",
          className: "bg-success-100 text-success-700 border-success-200",
        };
      case "PENDING":
        return {
          label: "Pending",
          className: "bg-yellow-100 text-yellow-700 border-yellow-200",
        };
      case "SUSPENDED":
        return {
          label: "Suspended",
          className: "bg-error-100 text-error-700 border-error-200",
        };
      default:
        return {
          label: status,
          className: "bg-neutral-100 text-neutral-700 border-neutral-200",
        };
    }
  };

  const roleBadge = getRoleBadge(profile.role);
  const statusBadge = getStatusBadge(profile.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-100 to-secondary-100 flex items-center justify-center text-2xl font-bold text-primary-700 flex-shrink-0">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name || profile.email}
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
                <h1 className="text-3xl font-bold text-neutral-900">
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
              <p className="text-neutral-600">{profile.email}</p>
              {profile.bio && (
                <p className="text-neutral-700 mt-2 max-w-2xl">{profile.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Edit Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 mb-6">Edit Profile</h2>
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
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4">Account Information</h3>
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                  Email Address
                </label>
                <p className="text-sm text-neutral-900">{profile.email}</p>
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
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Role */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
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
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                  Status
                </label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Dates */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                    Member Since
                  </label>
                  <p className="text-sm text-neutral-900">
                    {formatDate(profile.createdAt)}
                  </p>
                </div>
                {profile.lastLoginAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                      Last Login
                    </label>
                    <p className="text-sm text-neutral-900">
                      {formatDate(profile.lastLoginAt)}
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
