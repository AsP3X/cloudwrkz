import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermission } from "@/lib/utils/auth-server";
import { getGroups } from "@/server/actions/groups";
import { GroupPermissionsListPage } from "@/components/features/admin/GroupManagement/GroupPermissionsListPage";

interface GroupPermissionsPageProps {
  searchParams: Promise<{
    sort?: string;
    minMembers?: string;
    maxMembers?: string;
    minPermissions?: string;
    maxPermissions?: string;
    createdFrom?: string;
    createdTo?: string;
  }>;
}

export default async function AdminGroupPermissionsListPage({ searchParams }: GroupPermissionsPageProps) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  const params = await searchParams;
  const groups = await getGroups();

  return <GroupPermissionsListPage groups={groups} searchParams={params} />;
}
