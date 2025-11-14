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

  // Only allow USER role to access dashboard
  // ADMIN and MODERATOR can have separate dashboards later
  if (user.role !== "USER") {
    redirect(ROUTES.HOME);
  }

  // Get enabled modules for sidebar
  const modules = await getAllModules();
  const enabledModuleKeys = modules.filter((m: typeof modules[0]) => m.enabled).map((m: typeof modules[0]) => m.key);

  return (
    <div className="min-h-screen bg-neutral-50">
      <DashboardSidebar enabledModuleKeys={enabledModuleKeys} />
      <div className="lg:pl-64">
        <DashboardHeader user={user} />
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
