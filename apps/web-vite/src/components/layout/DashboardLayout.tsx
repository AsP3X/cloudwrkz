// Human: Authenticated dashboard shell: sidebar provider, role-specific sidebars, header, optional mutation queue notice, and guards that bounce anonymous users while honoring cached tokens.
// Agent: READS useAuth; HTTP GET /todos for nav badge when todos module; RENDERS Outlet; NAVIGATES unauthenticated users to login with return path.
import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { SidebarProvider } from "./SidebarContext";
import { DashboardSidebar, type NavCounts } from "./DashboardSidebar";
import { AdminSidebar } from "./AdminSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import { api } from "@/api/client";
import { MutationQueueNotice } from "@/components/ui/MutationQueueNotice";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";

function hasStoredAuthToken(): boolean {
  return Boolean(localStorage.getItem("auth_token"));
}

const Spinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <svg className="h-10 w-10 animate-spin text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  </div>
);

function DashboardLayoutContent() {
  const { user, modules, can } = useAuth();
  const [navCounts, setNavCounts] = useState<NavCounts>({});

  useEffect(() => {
    async function fetchCounts() {
      const counts: NavCounts = {};
      try {
        if (modules.includes("todos")) {
          const data = await api.get<{ todos: unknown[] }>("/todos");
          counts.todos = Array.isArray(data?.todos)
            ? data.todos.filter((t: any) => ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"].includes(t?.status)).length
            : 0;
        }
      } catch { /* ignore */ }
      setNavCounts(counts);
    }
    fetchCounts();
  }, [modules]);

  if (!user) return null;

  const isAdmin = user.role === "ADMIN";

  if (isAdmin) {
    return (
      <>
        <AdminSidebar
          enabledModuleKeys={modules}
          canViewUsers={can("admin.users.view") || can("admin.users.create") || can("admin.users.update") || can("admin.users.delete")}
          canManageGroups={can("admin.groups.manage")}
          canViewSessions={can("admin.sessions.view")}
          canViewPermissions={can("admin.permissions.view") || can("admin.permissions.manage")}
          canManagePermissions={can("admin.permissions.manage")}
          canViewStatistics={can("admin.statistics.view")}
          canManageModules={can("admin.modules.manage")}
          canViewAuditLog={can("audit.view")}
          canViewDbConsole={can("admin.db.view")}
          canManageSettings={can("admin.settings.manage")}
          canViewBackgroundJobs={can("admin.jobs.view")}
        />
        <DashboardHeader user={user} />
      </>
    );
  }

  return (
    <>
      <DashboardSidebar
        enabledModuleKeys={modules}
        userRole={user.role}
        navCounts={navCounts}
      />
      <DashboardHeader user={user} />
    </>
  );
}

function SessionConnectionWaitScreen({
  onRetry,
  retrying,
}: {
  onRetry: () => Promise<void>;
  retrying: boolean;
}) {
  return (
    <MouseSpotlightSurface
      variant="content"
      className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
    >
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="max-w-md rounded-xl border border-white/25 bg-white/82 p-8 text-center shadow-soft-xl ring-1 ring-neutral-900/[0.04] backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55 dark:ring-white/[0.06]">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Can&apos;t reach the server
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            You are still signed in. When the API or database is back, we&apos;ll load your account again.
            This is not a sign-out.
          </p>
          <button
            type="button"
            disabled={retrying}
            onClick={() => void onRetry()}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    </MouseSpotlightSurface>
  );
}

export const DashboardLayout = () => {
  const { user, loading, needsConnection, refreshUser } = useAuth();
  const [connectionRetrying, setConnectionRetrying] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const retryConnection = useCallback(async () => {
    setConnectionRetrying(true);
    try {
      await refreshUser();
    } finally {
      setConnectionRetrying(false);
    }
  }, [refreshUser]);
  /**
   * ToDo create (`/todos/new`) and task detail (`/todos/:id`) use inline `LoginQueuedBanner` in the
   * form / delete dialog for local → API → DB — hide duplicate top notices here.
   */
  const path = location.pathname;
  const isTodoCreatePage = path === "/dashboard/todos/new";
  const isTodoDetailPage =
    /^\/dashboard\/todos\/[^/]+$/.test(path) &&
    path !== "/dashboard/todos/new" &&
    path !== "/dashboard/todos/archive";
  const isEmployeesPage = path === ROUTES.EMPLOYEES || path.startsWith(`${ROUTES.EMPLOYEES}/`);
  const hideTopQueuedNotices = isTodoCreatePage || isTodoDetailPage;
  const showMutationQueueNotice = !hideTopQueuedNotices;

  useEffect(() => {
    if (!loading && !user && !hasStoredAuthToken()) {
      navigate(ROUTES.LOGIN + "?error=session_expired", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <Spinner />;
  if (!user && hasStoredAuthToken()) {
    return (
      <SessionConnectionWaitScreen onRetry={retryConnection} retrying={connectionRetrying} />
    );
  }
  if (!user) return <Spinner />;
  if (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    navigate(ROUTES.HOME, { replace: true });
    return <Spinner />;
  }

  const layoutContent = (
    <>
      {needsConnection ? (
        <div className="relative z-20 border-b border-amber-200/80 bg-amber-50/95 px-4 py-3 text-center text-sm text-amber-950 backdrop-blur-sm dark:border-amber-500/25 dark:bg-amber-950/45 dark:text-amber-100">
          <span className="font-medium">Limited connectivity.</span>{" "}
          Showing saved profile data until the server responds.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-50"
            onClick={() => void retryConnection()}
          >
            Retry
          </button>
        </div>
      ) : null}
      <DashboardLayoutContent />
      <main className={cn("min-h-screen relative z-10", "lg:pl-64")}>
        <div className="p-4 sm:p-6 lg:p-8">
          {showMutationQueueNotice ? <MutationQueueNotice /> : null}
          <Outlet />
        </div>
      </main>
    </>
  );

  return (
    <SidebarProvider>
      {isEmployeesPage ? (
        <div className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
          {layoutContent}
        </div>
      ) : (
        <MouseSpotlightSurface
          variant="content"
          className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
        >
          {layoutContent}
        </MouseSpotlightSurface>
      )}
    </SidebarProvider>
  );
};
