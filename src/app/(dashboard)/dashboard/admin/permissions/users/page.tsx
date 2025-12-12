import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { UserPermissionsPage } from "@/components/features/admin/UserPermissions/UserPermissionsPage";

export default async function AdminUserPermissionsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  return <UserPermissionsPage />;
}
