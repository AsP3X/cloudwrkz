import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermission } from "@/lib/utils/auth-server";
import { getGroup } from "@/server/actions/groups";
import { GroupPermissionsPage } from "@/components/features/admin/GroupManagement/GroupPermissionsPage";

export default async function AdminGroupPermissionsPage({
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

  const group = await getGroup(id);

  if (!group) {
    redirect("/dashboard/admin/permissions/groups");
  }

  return <GroupPermissionsPage group={group} />;
}
