import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requireAnyPermissionOrRedirect } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { getUserByIdAdmin } from "@/server/actions/admin/users";
import { UserDetailPage } from "@/components/features/admin/UserManagement/UserDetailPage";
import { hasPermission } from "@/lib/utils/permissions";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  await Promise.all([
    requireRole("ADMIN"),
    requireAnyPermissionOrRedirect(
      ROUTES.DASHBOARD,
      "admin.users.view",
      "admin.users.create",
      "admin.users.update",
      "admin.users.delete"
    ),
  ]);

  const { id } = await params;
  const userDetail = await getUserByIdAdmin(id);

  if (!userDetail) {
    redirect("/dashboard/admin/users");
  }

  const canManagePermissions = await hasPermission(user.id, "admin.permissions.manage");
  const canManageGroups = await hasPermission(user.id, "admin.groups.manage");
  const canUpdateUser = await hasPermission(user.id, "admin.users.update");

  return (
    <UserDetailPage
      user={userDetail}
      canManagePermissions={canManagePermissions}
      canManageGroups={canManageGroups}
      canUpdateUser={canUpdateUser}
    />
  );
}
