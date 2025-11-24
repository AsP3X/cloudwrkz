import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getAllModules, setModuleEnabled } from "@/server/actions/modules";
import { ModuleManagementPage } from "@/components/features/admin/ModuleManagement/ModuleManagementPage";

export default async function AdminModulesPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const modules = await getAllModules();

  return <ModuleManagementPage initialModules={modules} />;
}
