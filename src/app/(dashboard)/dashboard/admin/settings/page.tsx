import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getSystemInfo, getDatabaseStats, getSystemHealth } from "@/server/actions/admin/settings";
import { SystemSettingsPage } from "@/components/features/admin/SystemSettings/SystemSettingsPage";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const [systemInfo, databaseStats, health] = await Promise.all([
    getSystemInfo(),
    getDatabaseStats(),
    getSystemHealth(),
  ]);

  return (
    <SystemSettingsPage
      systemInfo={systemInfo}
      databaseStats={databaseStats}
      health={health}
    />
  );
}
