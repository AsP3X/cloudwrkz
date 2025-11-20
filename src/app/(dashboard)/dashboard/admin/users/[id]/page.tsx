import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getUserByIdAdmin } from "@/server/actions/admin/users";
import { UserDetailPage } from "@/components/features/admin/UserManagement/UserDetailPage";

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const userDetail = await getUserByIdAdmin(params.id);

  if (!userDetail) {
    redirect("/dashboard/admin/users");
  }

  return <UserDetailPage user={userDetail} />;
}
