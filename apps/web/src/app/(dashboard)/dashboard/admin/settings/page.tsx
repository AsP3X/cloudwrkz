import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requirePermissionOrRedirect } from "@/lib/utils/auth-server";
import {
  getSystemInfo,
  getDatabaseStats,
  getSystemHealth,
  getLinksDefaultPageSize,
} from "@/server/actions/admin/settings";
import { getQrLoginRequestsPerMinute } from "@/server/lib/qr-login-rate-limit";
import { SystemSettingsPage } from "@/components/features/admin/SystemSettings/SystemSettingsPage";

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await Promise.all([requireRole("ADMIN"), requirePermissionOrRedirect("admin.settings.manage")]);

  const [systemInfo, databaseStats, health, linksDefaultPageSize, qrLoginRequestsPerMinute] = await Promise.all([
    getSystemInfo(),
    getDatabaseStats(),
    getSystemHealth(),
    getLinksDefaultPageSize(),
    getQrLoginRequestsPerMinute(),
  ]);

  return (
    <SystemSettingsPage
      systemInfo={systemInfo}
      databaseStats={databaseStats}
      health={health}
      linksDefaultPageSize={linksDefaultPageSize}
      qrLoginRequestsPerMinute={qrLoginRequestsPerMinute}
    />
  );
}
