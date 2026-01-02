import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermission } from "@/lib/utils/auth-server";
import { getAllUsersAdmin } from "@/server/actions/admin/users";
import { UserPermissionsListPage } from "@/components/features/admin/UserPermissions/UserPermissionsListPage";

interface UserPermissionsPageProps {
  searchParams: Promise<{
    sort?: string;
    role?: string;
    status?: string;
    minPermissions?: string;
    maxPermissions?: string;
    createdFrom?: string;
    createdTo?: string;
  }>;
}

export default async function AdminUserPermissionsListPage({ searchParams }: UserPermissionsPageProps) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  const params = await searchParams;
  const result = await getAllUsersAdmin({});
  const users = result.users.map((u) => ({
    ...u,
    _count: {
      permissions: 0, // Will be loaded separately if needed
      groupMemberships: u._count?.groupMemberships || 0,
    },
  }));

  // Load permission counts for each user
  const { prisma } = await import("@/lib/db/prisma");
  const usersWithCounts = await Promise.all(
    users.map(async (u) => {
      let permissionCount = 0;
      try {
        if (prisma.userPermission) {
          permissionCount = await prisma.userPermission.count({
            where: { userId: u.id },
          });
        }
      } catch (error) {
        console.error(`Error counting permissions for user ${u.id}:`, error);
      }
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(), // Serialize date for client component
        _count: {
          permissions: permissionCount,
          groupMemberships: u._count?.groupMemberships || 0,
        },
      };
    })
  );

  return <UserPermissionsListPage users={usersWithCounts} searchParams={params} />;
}
