import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getAllModules, initializeModules } from "@/server/actions/modules";
import { ModuleManagementPage } from "@/components/features/admin/ModuleManagement/ModuleManagementPage";

export default async function AdminModulesPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  // Initialize modules (this will also clean up unused modules)
  await initializeModules();
  
  const modules = await getAllModules();

  return <ModuleManagementPage initialModules={modules} />;
}
