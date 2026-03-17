export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getBannedUserInfo } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { DashboardSidebar, type NavCounts } from "@/components/layout/DashboardSidebar";
import { AdminSidebarWrapper } from "@/components/layout/AdminSidebar/AdminSidebarWrapper";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { SidebarLayoutWrapper } from "@/components/layout/SidebarLayoutWrapper";
import { getAllModules, isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { FloatingTimerWidgetProvider } from "@/components/features/time-tracking/FloatingTimerWidget/FloatingTimerWidgetProvider";
import { getUserPermissions } from "@/lib/utils/permissions";
import { isDatabaseAccessible } from "@/lib/utils/db-health";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check database availability FIRST before attempting any database operations
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed in dashboard layout:", error);
  }

  // Only try to get current user if database is available
  let user = null;
  if (databaseAvailable) {
    try {
      user = await getCurrentUser();
    } catch (error) {
      // If getCurrentUser fails (e.g., database connection lost), treat as no user
      console.error("Error getting current user in dashboard layout:", error);
      user = null;
    }
  }

  // Redirect to login if not authenticated, active, or verified
  if (!user) {
    // Only check banned user if database is available
    if (databaseAvailable) {
      let bannedUser = null;
      try {
        bannedUser = await getBannedUserInfo();
      } catch (error) {
        console.error("Error getting banned user info:", error);
      }
      if (bannedUser) {
        redirect(ROUTES.BANNED);
      }
    }
    // Generic case: user is not authenticated or session is no longer valid
    redirect(`${ROUTES.LOGIN}?error=session_expired`);
  }

  // Allow USER, AGENT, ADMIN, and MODERATOR roles to access dashboard
  if (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    redirect(ROUTES.HOME);
  }

  // Use AdminSidebar for admins, DashboardSidebar for others
  const isAdmin = user.role === "ADMIN";
  
  // Get user permissions to check module visibility (only if database is available)
  let userPermissions = new Set<string>();
  if (databaseAvailable) {
    try {
      userPermissions = await getUserPermissions(user.id);
    } catch (error) {
      console.error("Error getting user permissions:", error);
      userPermissions = new Set<string>();
    }
  }
  
  // Check if admin can view/manage permissions section (only if database is available)
  const canViewPermissions =
    isAdmin &&
    databaseAvailable &&
    (userPermissions.has("admin.permissions.view") ||
      userPermissions.has("admin.permissions.manage"));
  const canManagePermissions =
    isAdmin && databaseAvailable && userPermissions.has("admin.permissions.manage");
  const canViewDbConsole =
    isAdmin && databaseAvailable && userPermissions.has("admin.db.view");
  const canViewAuditLog =
    isAdmin && databaseAvailable && userPermissions.has("audit.view");
  const canViewStatistics =
    isAdmin && databaseAvailable && userPermissions.has("admin.statistics.view");
  const canManageModules =
    isAdmin && databaseAvailable && userPermissions.has("admin.modules.manage");
  const canManageSettings =
    isAdmin && databaseAvailable && userPermissions.has("admin.settings.manage");
  const canViewUsers =
    isAdmin &&
    databaseAvailable &&
    (userPermissions.has("admin.users.view") ||
      userPermissions.has("admin.users.create") ||
      userPermissions.has("admin.users.update") ||
      userPermissions.has("admin.users.delete"));
  const canManageGroups =
    isAdmin && databaseAvailable && userPermissions.has("admin.groups.manage");
  const canViewSessions =
    isAdmin && databaseAvailable && userPermissions.has("admin.sessions.view");

  // Get enabled modules for sidebar (only if database is available)
  let modules: Awaited<ReturnType<typeof getAllModules>> = [];
  if (databaseAvailable) {
    try {
      modules = await getAllModules();
    } catch (error) {
      console.error("Error getting modules:", error);
      modules = [];
    }
  }
  // Sort modules by key to ensure consistent order between server and client
  const sortedModules = [...modules].sort((a, b) => a.key.localeCompare(b.key));
  
  // Map module keys to permission keys
  const modulePermissionMap: Record<string, string> = {
    [MODULE_KEYS.TICKETS]: "modules.tickets.view",
    [MODULE_KEYS.TIMETRACKING]: "modules.timetracking.view",
    [MODULE_KEYS.TODOS]: "modules.todos.view",
    [MODULE_KEYS.LINKS]: "modules.links.view",
  };

  // Helper: user can see this module (permission check; admins are filtered by permissions too)
  const canSeeModule = (m: (typeof modules)[0]) => {
    const permissionKey = modulePermissionMap[m.key];
    if (!permissionKey) return true;
    if (m.key === MODULE_KEYS.TODOS) {
      const hasModulePermission = userPermissions.has(permissionKey as never);
      const hasTodoPermission =
        userPermissions.has("todos.view" as never) ||
        userPermissions.has("todos.create" as never) ||
        userPermissions.has("todos.update" as never) ||
        userPermissions.has("todos.delete" as never);
      return hasModulePermission || hasTodoPermission;
    }
    return userPermissions.has(permissionKey as never);
  };

  // Filter modules based on:
  // 1. Global module enablement (from Module table)
  // 2. User's permission to view the module (admins and non-admins both filtered by permissions)
  const enabledModuleKeys = sortedModules
    .filter((m: (typeof modules)[0]) => {
      if (!m.enabled) return false;
      return canSeeModule(m);
    })
    .map((m: typeof modules[0]) => m.key)
    .sort();
  
  // Create a key based on module status to force re-render when modules change
  // This ensures AdminSidebar re-mounts when modules are enabled/disabled
  // Use sorted modules to ensure consistent key generation
  const moduleStatusKey = sortedModules.map((m: typeof modules[0]) => `${m.key}:${m.enabled}`).join(",");

  // Check if time tracking module is enabled for floating timer widget (only if database is available)
  let timeTrackingEnabled = false;
  if (databaseAvailable) {
    try {
      timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    } catch (error) {
      console.error("Error checking time tracking module:", error);
      timeTrackingEnabled = false;
    }
  }

  // Fetch nav badge counts for non-admin users (SSR, runs in parallel with other checks)
  let navCounts: NavCounts = {};
  if (!isAdmin && databaseAvailable) {
    try {
      const { prisma } = await import("@/lib/db/prisma");
      const unresolvedStatuses = ["OPEN", "IN_PROGRESS", "PENDING"] as const;

      const [ticketCount, todoCount] = await Promise.all([
        enabledModuleKeys.includes(MODULE_KEYS.TICKETS)
          ? prisma.ticket.count({
              where: {
                assignedToId: user.id,
                status: { in: [...unresolvedStatuses] },
                archivedAt: null,
              },
            })
          : Promise.resolve(0),
        enabledModuleKeys.includes(MODULE_KEYS.TODOS)
          ? prisma.todo.count({
              where: {
                assignedToId: user.id,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
                archivedAt: null,
              },
            })
          : Promise.resolve(0),
      ]);

      navCounts = {
        tickets: ticketCount > 0 ? ticketCount : undefined,
        todos: todoCount > 0 ? todoCount : undefined,
      };
    } catch (error) {
      console.error("Error fetching nav badge counts:", error);
    }
  }

  return (
    <SidebarLayoutWrapper>
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
        {/* Background decoration */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-100 dark:bg-primary-950 rounded-full mix-blend-multiply filter blur-3xl opacity-5 dark:opacity-2" />
        </div>
        {isAdmin ? (
          <AdminSidebarWrapper
            canViewPermissions={canViewPermissions}
            canManagePermissions={canManagePermissions}
            canViewDbConsole={canViewDbConsole}
            canViewAuditLog={canViewAuditLog}
            canViewStatistics={canViewStatistics}
            canManageModules={canManageModules}
            canManageSettings={canManageSettings}
            canViewUsers={canViewUsers}
            canManageGroups={canManageGroups}
            canViewSessions={canViewSessions}
            enabledModuleKeys={enabledModuleKeys}
          />
        ) : (
          <DashboardSidebar enabledModuleKeys={enabledModuleKeys} userRole={user.role} navCounts={navCounts} />
        )}
        <div className="lg:pl-64 relative z-10">
          <DashboardHeader user={user} databaseAvailable={databaseAvailable} />
          <main className="p-4 sm:p-6 lg:p-8">
            {enabledModuleKeys.length === 0 && (
              <div
                className="mb-6 rounded-lg border border-amber-500/50 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-3"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      No modules available
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mt-0.5">
                      No modules are available due to a lack of permissions or because the modules are disabled. Contact your administrator if you need access.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
        <FloatingTimerWidgetProvider timeTrackingEnabled={timeTrackingEnabled} />
      </div>
    </SidebarLayoutWrapper>
  );
}
