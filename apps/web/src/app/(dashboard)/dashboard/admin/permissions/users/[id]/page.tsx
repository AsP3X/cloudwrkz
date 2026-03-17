import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermission } from "@/lib/utils/auth-server";
import { getUserByIdAdmin } from "@/server/actions/admin/users";
import { UserPermissionsPage } from "@/components/features/admin/UserPermissions/UserPermissionsPage";

export default async function AdminUserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  const [, { id }] = await Promise.all([
    requireAnyPermission("admin.permissions.view", "admin.permissions.manage"),
    params,
  ]);

  const userData = await getUserByIdAdmin(id);

  if (!userData) {
    redirect("/dashboard/admin/permissions/users");
  }

  return <UserPermissionsPage user={userData} />;
}
