import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";

export type AdminStats = {
  totalUsers: number;
  usersByStatus: { ACTIVE: number; PENDING: number; SUSPENDED: number; DELETED: number };
  totalTickets: number;
  ticketsByStatus: {
    OPEN: number;
    IN_PROGRESS: number;
    PENDING: number;
    RESOLVED: number;
    CLOSED: number;
    CANCELLED: number;
  };
  activeSessions: number;
  enabledModules: number;
  totalModules: number;
  totalGroups: number;
  recentRegistrations: number;
  recentTickets: number;
};

const cardBase =
  "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50";

export function AdminDashboard({ displayName }: { displayName: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminStats>("/admin/dashboard-stats")
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={cardBase + " p-6"}>
        <p className="text-neutral-600 dark:text-neutral-400">
          Failed to load admin dashboard stats.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div
        className={
          cardBase +
          " p-6 sm:p-8 relative overflow-hidden"
        }
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
                Admin Dashboard
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 text-lg">
                Welcome back,{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {displayName}
                </span>
                ! Manage your system.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-100 to-primary-50 dark:from-primary-900 dark:to-primary-950 rounded-lg border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
              <svg
                className="w-5 h-5 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                Admin
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid - 4 main cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div
          className={
            cardBase +
            " p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group"
          }
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/30 transition-colors" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Total Users
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent mt-2">
                {stats.totalUsers}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                {stats.usersByStatus.ACTIVE} active, {stats.usersByStatus.PENDING} pending
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900 dark:to-primary-950 rounded-lg flex items-center justify-center border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div
          className={
            cardBase +
            " p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group"
          }
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-100 dark:bg-secondary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-secondary-200 dark:group-hover:bg-secondary-800/30 transition-colors" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Total Tickets
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-secondary-600 to-secondary-700 bg-clip-text text-transparent mt-2">
                {stats.totalTickets}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                {stats.ticketsByStatus.OPEN} open, {stats.ticketsByStatus.RESOLVED} resolved
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-secondary-100 to-secondary-50 dark:from-secondary-900 dark:to-secondary-950 rounded-lg flex items-center justify-center border border-secondary-200/50 dark:border-secondary-800/50 shadow-sm">
              <svg
                className="w-6 h-6 text-secondary-600"
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
            </div>
          </div>
        </div>

        <div
          className={
            cardBase +
            " p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group"
          }
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-success-100/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-success-200/30 transition-colors" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Active Sessions
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-success-600 to-success-700 bg-clip-text text-transparent mt-2">
                {stats.activeSessions}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Currently logged in users
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-success-100 to-success-50 dark:from-success-900 dark:to-success-950 rounded-lg flex items-center justify-center border border-success-200/50 dark:border-success-800/50 shadow-sm">
              <svg
                className="w-6 h-6 text-success-600"
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
            </div>
          </div>
        </div>

        <div
          className={
            cardBase +
            " p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group"
          }
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-warning-100 dark:bg-warning-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-warning-200 dark:group-hover:bg-warning-800/30 transition-colors" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Enabled Modules
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-warning-600 to-warning-700 bg-clip-text text-transparent mt-2">
                {stats.enabledModules}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Out of {stats.totalModules} total modules
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900 dark:to-warning-950 rounded-lg flex items-center justify-center border border-warning-200/50 dark:border-warning-800/50 shadow-sm">
              <svg
                className="w-6 h-6 text-warning-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats - 3 smaller cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className={cardBase + " p-6"}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Groups
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
                {stats.totalGroups}
              </p>
            </div>
            <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-neutral-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className={cardBase + " p-6"}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Recent Registrations
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
                {stats.recentRegistrations}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Last 7 days
              </p>
            </div>
            <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-neutral-600"
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
            </div>
          </div>
        </div>
        <div className={cardBase + " p-6"}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Recent Tickets
              </p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
                {stats.recentTickets}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Last 7 days
              </p>
            </div>
            <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-neutral-600"
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
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className={
          cardBase + " p-6 sm:p-8 relative overflow-hidden"
        }
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-secondary-100/20 to-primary-100/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent mb-6">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to={ROUTES.ADMIN_USERS}
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-primary-300 hover:bg-gradient-to-br hover:from-primary-50 dark:hover:from-primary-900 hover:to-primary-50/50 dark:hover:to-primary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary-100 dark:bg-primary-900/0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors">
                  <svg
                    className="w-5 h-5 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                  Manage Users
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  View and manage all users
                </p>
              </div>
            </Link>
            <Link
              to={ROUTES.ADMIN_MODULES}
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-secondary-300 dark:hover:border-secondary-700 hover:bg-gradient-to-br hover:from-secondary-50 dark:hover:from-secondary-900 hover:to-secondary-50/50 dark:hover:to-secondary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-secondary-100 dark:bg-secondary-900/0 group-hover:bg-secondary-100 dark:group-hover:bg-secondary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-secondary-100 dark:bg-secondary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-secondary-200 dark:group-hover:bg-secondary-800 transition-colors">
                  <svg
                    className="w-5 h-5 text-secondary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-secondary-700 dark:group-hover:text-secondary-300 transition-colors">
                  Manage Modules
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Enable or disable modules
                </p>
              </div>
            </Link>
            <Link
              to={ROUTES.ADMIN_GROUPS}
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-warning-300 dark:hover:border-warning-700 hover:bg-gradient-to-br hover:from-warning-50 dark:hover:from-warning-900 hover:to-warning-50/50 dark:hover:to-warning-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-warning-100 dark:bg-warning-900/0 group-hover:bg-warning-100 dark:group-hover:bg-warning-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-warning-100 dark:bg-warning-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-warning-200 dark:group-hover:bg-warning-800 transition-colors">
                  <svg
                    className="w-5 h-5 text-warning-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-warning-700 dark:group-hover:text-warning-200 transition-colors">
                  Manage Groups
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Manage agent groups
                </p>
              </div>
            </Link>
            <Link
              to={ROUTES.ADMIN_SETTINGS}
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-gradient-to-br hover:from-neutral-50 dark:hover:from-neutral-800 hover:to-neutral-50/50 dark:hover:to-neutral-800/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-neutral-100 dark:bg-neutral-800/0 group-hover:bg-neutral-100 dark:group-hover:bg-neutral-800/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center mb-3 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg
                    className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
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
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
                  System Settings
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  System configuration
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
