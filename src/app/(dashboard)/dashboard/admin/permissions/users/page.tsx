import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermission } from "@/lib/utils/auth-server";
import { UserPermissionsPage } from "@/components/features/admin/UserPermissions/UserPermissionsPage";

export default async function AdminUserPermissionsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  return <UserPermissionsPage />;
}
