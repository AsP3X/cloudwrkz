import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { SidebarProvider } from "./SidebarContext";
import { DashboardSidebar, type NavCounts } from "./DashboardSidebar";
import { AdminSidebar } from "./AdminSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";
import { api } from "@/api/client";

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

export const DashboardLayout = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate(ROUTES.LOGIN + "?error=session_expired", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return <Spinner />;
  if (!user) return <Spinner />;
  if (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    navigate(ROUTES.HOME, { replace: true });
    return <Spinner />;
  }

  return (
    <SidebarProvider>
      <DashboardLayoutContent />
      <main className={cn("min-h-screen bg-neutral-50 dark:bg-neutral-950", "lg:pl-64", "relative overflow-hidden")}>
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary-200/30 dark:bg-primary-900/20 blur-3xl" />
          <div className="absolute top-1/2 -left-40 h-60 w-60 rounded-full bg-secondary-200/30 dark:bg-secondary-900/20 blur-3xl" />
        </div>
        <div className="relative z-10 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};
