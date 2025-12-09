export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getBannedUserInfo } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { AdminSidebarWrapper } from "@/components/layout/AdminSidebar/AdminSidebarWrapper";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { SidebarLayoutWrapper } from "@/components/layout/SidebarLayoutWrapper";
import { getAllModules, isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { FloatingTimerWidgetProvider } from "@/components/features/time-tracking/FloatingTimerWidget/FloatingTimerWidgetProvider";
import { getUserPermissions } from "@/lib/utils/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Redirect to login if not authenticated, active, or verified
  if (!user) {
    // Check if user is banned (they might have a session but be banned)
    const bannedUser = await getBannedUserInfo();
    if (bannedUser) {
      redirect(ROUTES.BANNED);
    }
    redirect(`${ROUTES.LOGIN}?error=account_not_verified`);
  }

  // Allow USER, AGENT, ADMIN, and MODERATOR roles to access dashboard
  if (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    redirect(ROUTES.HOME);
  }

  // Use AdminSidebar for admins, DashboardSidebar for others
  const isAdmin = user.role === "ADMIN";
  
  // Get enabled modules for sidebar
  const modules = await getAllModules();
  // Sort modules by key to ensure consistent order between server and client
  const sortedModules = [...modules].sort((a, b) => a.key.localeCompare(b.key));
  
  // Get user permissions to check module visibility
  const userPermissions = await getUserPermissions(user.id);
  
  // Map module keys to permission keys
  const modulePermissionMap: Record<string, string> = {
    [MODULE_KEYS.TICKETS]: "modules.tickets.view",
    [MODULE_KEYS.TIMETRACKING]: "modules.timetracking.view",
    [MODULE_KEYS.PROJECTS]: "modules.projects.view",
  };
  
  // Filter modules based on:
  // 1. Global module enablement (from Module table)
  // 2. User's permission to view the module (from permissions)
  // Admins can see all enabled modules
  const enabledModuleKeys = sortedModules
    .filter((m: typeof modules[0]) => {
      if (!m.enabled) return false;
      // Admins can see all enabled modules
      if (isAdmin) return true;
      // For non-admins, check if they have permission to view this module
      const permissionKey = modulePermissionMap[m.key];
      if (!permissionKey) return true; // If no permission mapping, allow (backward compatibility)
      return userPermissions.has(permissionKey as any);
    })
    .map((m: typeof modules[0]) => m.key)
    .sort();
  
  // Create a key based on module status to force re-render when modules change
  // This ensures AdminSidebar re-mounts when modules are enabled/disabled
  // Use sorted modules to ensure consistent key generation
  const moduleStatusKey = sortedModules.map((m: typeof modules[0]) => `${m.key}:${m.enabled}`).join(",");

  // Check if time tracking module is enabled for floating timer widget
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);

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
          <AdminSidebarWrapper />
        ) : (
          <DashboardSidebar enabledModuleKeys={enabledModuleKeys} userRole={user.role} />
        )}
        <div className="lg:pl-64 relative z-10">
          <DashboardHeader user={user} />
          <main className="p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
        <FloatingTimerWidgetProvider timeTrackingEnabled={timeTrackingEnabled} />
      </div>
    </SidebarLayoutWrapper>
  );
}
