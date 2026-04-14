import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requireAnyPermissionOrRedirect } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { getAllUsersAdmin } from "@/server/actions/admin/users";
import { UserManagementPage } from "@/components/features/admin/UserManagement/UserManagementPage";
import { getUserPermissions } from "@/lib/utils/permissions";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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

  const params = await searchParams;
  const status = params.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED" | undefined;
  const role = params.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR" | undefined;
  const search = params.search as string | undefined;
  const page = params.page ? parseInt(params.page as string) : 1;

  const [result, perms] = await Promise.all([
    getAllUsersAdmin({
      status,
      role,
      search,
      page,
      limit: 50,
    }),
    getUserPermissions(user.id),
  ]);

  const userAdminRowContext = {
    canViewDetail:
      perms.has("admin.users.view") ||
      perms.has("admin.users.update") ||
      perms.has("admin.users.delete"),
    canUpdate: perms.has("admin.users.update"),
    canDelete: perms.has("admin.users.delete"),
  };

  return <UserManagementPage initialData={result} userAdminRowContext={userAdminRowContext} />;
}
