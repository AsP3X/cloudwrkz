import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requireAnyPermissionOrRedirect } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { getAllUsersAdmin } from "@/server/actions/admin/users";
import { UserManagementPage } from "@/components/features/admin/UserManagement/UserManagementPage";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");
  await requireAnyPermissionOrRedirect(
    ROUTES.DASHBOARD,
    "admin.users.view",
    "admin.users.create",
    "admin.users.update",
    "admin.users.delete"
  );

  const status = searchParams.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED" | undefined;
  const role = searchParams.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR" | undefined;
  const search = searchParams.search as string | undefined;
  const page = searchParams.page ? parseInt(searchParams.page as string) : 1;

  const result = await getAllUsersAdmin({
    status,
    role,
    search,
    page,
    limit: 50,
  });

  return <UserManagementPage initialData={result} />;
}
