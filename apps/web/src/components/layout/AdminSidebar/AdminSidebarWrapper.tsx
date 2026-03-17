import { AdminSidebar } from "./AdminSidebar";

interface AdminSidebarWrapperProps {
  canViewPermissions?: boolean;
  canManagePermissions?: boolean;
  canViewDbConsole?: boolean;
  canViewAuditLog?: boolean;
  canViewStatistics?: boolean;
  canManageModules?: boolean;
  canManageSettings?: boolean;
  canViewUsers?: boolean;
  canManageGroups?: boolean;
  canViewSessions?: boolean;
  enabledModuleKeys?: string[];
}

const EMPTY_MODULE_KEYS: string[] = [];

export function AdminSidebarWrapper({
  canViewPermissions = false,
  canManagePermissions = false,
  canViewDbConsole = false,
  canViewAuditLog = false,
  canViewStatistics = false,
  canManageModules = false,
  canManageSettings = false,
  canViewUsers = false,
  canManageGroups = false,
  canViewSessions = false,
  enabledModuleKeys = EMPTY_MODULE_KEYS,
}: AdminSidebarWrapperProps) {
  return (
    <AdminSidebar
      canViewPermissions={canViewPermissions}
      canManagePermissions={canManagePermissions}
      canViewDbConsole={canViewDbConsole}
      canViewAuditLog={canViewAuditLog}
      canViewStatistics={canViewStatistics}
      canManageModules={canManageModules}
      canManageSettings={canManageSettings}
      canViewUsers={canViewUsers}
      canManageGroups={canManageGroups}
      canViewSessions={canViewSessions}
      enabledModuleKeys={enabledModuleKeys}
    />
  );
}

