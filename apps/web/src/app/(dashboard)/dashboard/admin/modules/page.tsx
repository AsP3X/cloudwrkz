import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requirePermissionOrRedirect } from "@/lib/utils/auth-server";
import { getAllModules, initializeModules } from "@/server/actions/modules";
import { ModuleManagementPage } from "@/components/features/admin/ModuleManagement/ModuleManagementPage";

export default async function AdminModulesPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await Promise.all([requireRole("ADMIN"), requirePermissionOrRedirect("admin.modules.manage")]);

  // Initialize modules (this will also clean up unused modules)
  await initializeModules();
  
  const modules = await getAllModules();

  return <ModuleManagementPage initialModules={modules} />;
}
