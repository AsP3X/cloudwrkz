import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { getGroup } from "@/server/actions/groups";
import { GroupDetailPage } from "@/components/features/admin/GroupManagement/GroupDetailPage";

export default async function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const { id } = await params;
  const group = await getGroup(id);

  if (!group) {
    redirect("/dashboard/admin/groups");
  }

  const canManagePermissions = await hasPermission(user.id, "admin.permissions.manage");

  return <GroupDetailPage group={group} canManagePermissions={canManagePermissions} />;
}
