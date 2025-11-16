import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { getAllModules } from "@/server/actions/modules";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Allow USER and AGENT roles to access dashboard
  // ADMIN and MODERATOR can have separate dashboards later
  if (user.role !== "USER" && user.role !== "AGENT") {
    redirect(ROUTES.HOME);
  }

  // Get enabled modules for sidebar
  const modules = await getAllModules();
  const enabledModuleKeys = modules.filter((m: typeof modules[0]) => m.enabled).map((m: typeof modules[0]) => m.key);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary-100 dark:bg-primary-950 rounded-full mix-blend-multiply filter blur-3xl opacity-5 dark:opacity-2" />
      </div>
      <DashboardSidebar enabledModuleKeys={enabledModuleKeys} />
      <div className="lg:pl-64 relative z-10">
        <DashboardHeader user={user} />
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
