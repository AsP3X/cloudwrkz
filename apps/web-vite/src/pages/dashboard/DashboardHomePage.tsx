import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { ROUTES } from "@/lib/constants/routes";

export default function DashboardHomePage() {
  const { user } = useAuth();
  const displayName = user?.name || user?.email?.split("@")[0] || "User";
  const currentDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
            Welcome back, {displayName}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg">
            {currentDate}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">Overview</h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Coming soon</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">Activity</h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Coming soon</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">Status</h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Coming soon</p>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to={ROUTES.TODOS}
            className="p-4 border-2 border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="font-medium text-neutral-900 dark:text-neutral-100">ToDo</span>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Manage tasks</p>
          </Link>
          <Link
            to={ROUTES.LINKS}
            className="p-4 border-2 border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="font-medium text-neutral-900 dark:text-neutral-100">My Links</span>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Bookmarks</p>
          </Link>
          <Link
            to="/dashboard/profile"
            className="p-4 border-2 border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="font-medium text-neutral-900 dark:text-neutral-100">Profile</span>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">View profile</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
