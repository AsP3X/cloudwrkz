// Human: Shared permission key registry mirrors `shared/permissions/catalog.json` for typed client-side gates.
// Agent: IMPORTS catalog JSON; EXPORTS PERM constants + helper predicates for admin/agent capability checks.

import catalog from "@shared/permissions/catalog.json";

export const PERM = {
  ADMIN_DB_DELETE_ENTRIES: "admin.db.delete_entries",
  ADMIN_DB_EDIT_ENTRIES: "admin.db.edit_entries",
  ADMIN_DB_QUERY: "admin.db.query",
  ADMIN_DB_VIEW: "admin.db.view",
  ADMIN_DB_VIEW_ENTRIES: "admin.db.view_entries",
  ADMIN_GROUPS_MANAGE: "admin.groups.manage",
  ADMIN_GROUPS_VIEW: "admin.groups.view",
  ADMIN_JOBS_VIEW: "admin.jobs.view",
  ADMIN_MODULES_MANAGE: "admin.modules.manage",
  ADMIN_PERMISSIONS_MANAGE: "admin.permissions.manage",
  ADMIN_PERMISSIONS_VIEW: "admin.permissions.view",
  ADMIN_SETTINGS_MANAGE: "admin.settings.manage",
  ADMIN_SESSIONS_REVOKE: "admin.sessions.revoke",
  ADMIN_SESSIONS_VIEW: "admin.sessions.view",
  ADMIN_STATISTICS_VIEW: "admin.statistics.view",
  ADMIN_TICKETS_MANAGE: "admin.tickets.manage",
  ADMIN_USERS_BAN: "admin.users.ban",
  ADMIN_USERS_CREATE: "admin.users.create",
  ADMIN_USERS_DELETE: "admin.users.delete",
  ADMIN_USERS_RESET_PASSWORD: "admin.users.reset_password",
  ADMIN_USERS_UPDATE: "admin.users.update",
  ADMIN_USERS_VIEW: "admin.users.view",
  AUDIT_EXPORT: "audit.export",
  AUDIT_VIEW: "audit.view",
  ARCHIVE_VIEW: "archive.view",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_DELETE: "employees.delete",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_VIEW_SELF: "employees.view_self",
  MODULES_EMPLOYEES_VIEW: "modules.employees.view",
  MODULES_LINKS_VIEW: "modules.links.view",
  MODULES_TICKETS_VIEW: "modules.tickets.view",
  MODULES_TIMETRACKING_VIEW: "modules.timetracking.view",
  MODULES_TODOS_VIEW: "modules.todos.view",
  SEARCH_USE: "search.use",
  TICKETS_ASSIGN: "tickets.assign",
  TICKETS_COMMENT: "tickets.comment",
  TICKETS_COMMENTS_AGENT_ONLY: "tickets.comments.agent_only",
  TICKETS_COMMENTS_VIEW_INTERNAL: "tickets.comments.view_internal",
  TICKETS_CREATE: "tickets.create",
  TICKETS_DELETE: "tickets.delete",
  TICKETS_TIME_ENTRIES_CREATE: "tickets.time_entries.create",
  TICKETS_TIME_ENTRIES_VIEW: "tickets.time_entries.view",
  TICKETS_UPDATE: "tickets.update",
  TICKETS_VIEW: "tickets.view",
  TICKETS_VIEW_ALL: "tickets.view_all",
  TODOS_ASSIGN: "todos.assign",
  TODOS_CREATE: "todos.create",
  TODOS_DELETE: "todos.delete",
  TODOS_UPDATE: "todos.update",
  TODOS_VIEW: "todos.view",
} as const;

export type PermissionKey = (typeof PERM)[keyof typeof PERM];

export const ADMIN_AREA_KEYS: readonly string[] = catalog.adminAreaKeys;
export const AGENT_CAPABILITY_KEYS: readonly string[] = catalog.agentCapabilityKeys;

/** True when the user can see any admin navigation section (permissions-only; role labels ignored). */
export function hasAdminAreaAccess(can: (permission: string) => boolean): boolean {
  return ADMIN_AREA_KEYS.some(can);
}

/** True when the user has support/agent ticket capabilities. */
export function hasAgentCapabilities(can: (permission: string) => boolean): boolean {
  return AGENT_CAPABILITY_KEYS.some(can);
}

/** True when the user may update or delete another user's ticket (not only their own). */
export function canManageOthersTickets(can: (permission: string) => boolean): boolean {
  return (
    (can(PERM.TICKETS_UPDATE) || can(PERM.TICKETS_DELETE)) &&
    (can(PERM.TICKETS_VIEW_ALL) || can(PERM.ADMIN_TICKETS_MANAGE))
  );
}

export function canDeleteOthersTickets(can: (permission: string) => boolean): boolean {
  return (
    can(PERM.TICKETS_DELETE) &&
    (can(PERM.TICKETS_VIEW_ALL) || can(PERM.ADMIN_TICKETS_MANAGE))
  );
}
