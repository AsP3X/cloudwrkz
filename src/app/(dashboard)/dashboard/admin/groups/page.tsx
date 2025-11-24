import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getGroups } from "@/server/actions/groups";
import { GroupManagementPage } from "@/components/features/admin/GroupManagement/GroupManagementPage";

export default async function AdminGroupsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const groups = await getGroups();

  return <GroupManagementPage initialGroups={groups} />;
}
