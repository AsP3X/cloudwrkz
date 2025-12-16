import { AdminSidebar } from "./AdminSidebar";

interface AdminSidebarWrapperProps {
  canViewPermissions?: boolean;
  canManagePermissions?: boolean;
}

export function AdminSidebarWrapper({
  canViewPermissions = false,
  canManagePermissions = false,
}: AdminSidebarWrapperProps) {
  return (
    <AdminSidebar
      canViewPermissions={canViewPermissions}
      canManagePermissions={canManagePermissions}
    />
  );
}
