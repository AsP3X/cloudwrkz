import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getUserByIdAdmin } from "@/server/actions/admin/users";
import { UserDetailPage } from "@/components/features/admin/UserManagement/UserDetailPage";

export default async function AdminUserDetailPage({
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
  const userDetail = await getUserByIdAdmin(id);

  if (!userDetail) {
    redirect("/dashboard/admin/users");
  }

  return <UserDetailPage user={userDetail} />;
}
