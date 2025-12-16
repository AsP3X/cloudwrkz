import { AdminSidebar } from "./AdminSidebar";

interface AdminSidebarWrapperProps {
  canViewPermissions?: boolean;
  canManagePermissions?: boolean;
  canViewDbConsole?: boolean;
}

export function AdminSidebarWrapper({
  canViewPermissions = false,
  canManagePermissions = false,
  canViewDbConsole = false,
}: AdminSidebarWrapperProps) {
  return (
    <AdminSidebar
      canViewPermissions={canViewPermissions}
      canManagePermissions={canManagePermissions}
      canViewDbConsole={canViewDbConsole}
    />
  );
}

