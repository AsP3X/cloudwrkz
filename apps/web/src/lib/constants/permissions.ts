/**
 * Permission definitions and constants
 * Defines all available permissions in the system
 */

export type PermissionKey = 
  // Tickets
  | "tickets.view"
  | "tickets.view_all"
  | "tickets.create"
  | "tickets.update"
  | "tickets.delete"
  | "tickets.assign"
  | "tickets.comment"
  | "tickets.time_entries.view"
  | "tickets.time_entries.create"
  | "tickets.merge"
  | "tickets.bulk_update"
  | "tickets.bulk_delete"
  | "tickets.bulk_archive"
  | "tickets.bulk_unarchive"
  | "tickets.archive"
  | "tickets.comments.agent_only"
  | "tickets.comments.view_internal"
  | "tickets.export"
  | "tickets.reports.view"
  // Time Tracking
  | "time_tracking.view"
  | "time_tracking.view_all"
  | "time_tracking.create"
  | "time_tracking.update"
  | "time_tracking.delete"
  // Todos
  | "todos.view"
  | "todos.create"
  | "todos.update"
  | "todos.delete"
  | "todos.assign"
  // Issues
  | "issues.view"
  | "issues.create"
  | "issues.update"
  | "issues.delete"
  // Notes
  | "notes.view"
  | "notes.create"
  | "notes.update"
  | "notes.delete"
  // Admin
  | "admin.users.view"
  | "admin.users.create"
  | "admin.users.update"
  | "admin.users.delete"
  | "admin.groups.manage"
  | "admin.permissions.view"
  | "admin.permissions.manage"
  | "admin.settings.manage"
  | "admin.modules.manage"
  | "admin.sessions.view"
  | "admin.statistics.view"
  | "admin.tickets.manage"
  | "admin.db.view"
  | "admin.db.view_entries"
  | "admin.db.edit_entries"
  | "admin.db.delete_entries"
  | "admin.db.query"
  | "audit.view"
  | "audit.export"
  // Links
  | "links.view"
  | "links.view_all"
  | "links.create"
  | "links.update"
  | "links.delete"
  | "links.share"
  | "links.import"
  | "links.export"
  | "links.archive"
  // Collections
  | "collections.view"
  | "collections.create"
  | "collections.update"
  | "collections.delete"
  | "collections.share"
  // Module Visibility
  | "modules.tickets.view"
  | "modules.timetracking.view"
  | "modules.todos.view"
  | "modules.links.view";

export interface PermissionDefinition {
  key: PermissionKey;
  name: string;
  description: string;
  category: string;
  module?: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  // Tickets
  {
    key: "tickets.view",
    name: "View Tickets",
    description: "View tickets assigned to user or user's groups",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.view_all",
    name: "View All Tickets",
    description: "View all tickets regardless of assignment",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.create",
    name: "Create Tickets",
    description: "Create new support tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.update",
    name: "Update Tickets",
    description: "Update existing tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.delete",
    name: "Delete Tickets",
    description: "Delete tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.assign",
    name: "Assign Tickets",
    description: "Assign tickets to users or groups",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.comment",
    name: "Comment on Tickets",
    description: "Add comments to tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.time_entries.view",
    name: "View Ticket Time Entries",
    description: "View time entries in ticket detail view",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.time_entries.create",
    name: "Create Ticket Time Entries",
    description: "Create time entries from ticket detail view",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.merge",
    name: "Merge Tickets",
    description: "Merge one ticket into another",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.bulk_update",
    name: "Bulk Update Tickets",
    description: "Perform bulk update operations on multiple tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.bulk_delete",
    name: "Bulk Delete Tickets",
    description: "Delete multiple tickets in a single operation",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.bulk_archive",
    name: "Bulk Archive Tickets",
    description: "Archive multiple tickets in a single operation",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.bulk_unarchive",
    name: "Bulk Unarchive Tickets",
    description: "Unarchive multiple tickets in a single operation",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.archive",
    name: "Archive Tickets",
    description: "Archive and unarchive individual tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.comments.agent_only",
    name: "Create Internal Ticket Comments",
    description: "Create agent-only/internal comments on tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.comments.view_internal",
    name: "View Internal Ticket Comments",
    description: "View agent-only/internal comments on tickets",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.export",
    name: "Export Tickets",
    description: "Export ticket data for reporting or backup",
    category: "tickets",
    module: "tickets",
  },
  {
    key: "tickets.reports.view",
    name: "View Ticket Reports",
    description: "View ticket analytics and reports",
    category: "tickets",
    module: "tickets",
  },
  // Time Tracking
  {
    key: "time_tracking.view",
    name: "View Time Entries",
    description: "View own time entries",
    category: "time_tracking",
    module: "timetracking",
  },
  {
    key: "time_tracking.view_all",
    name: "View All Time Entries",
    description: "View all time entries",
    category: "time_tracking",
    module: "timetracking",
  },
  {
    key: "time_tracking.create",
    name: "Create Time Entries",
    description: "Create new time entries",
    category: "time_tracking",
    module: "timetracking",
  },
  {
    key: "time_tracking.update",
    name: "Update Time Entries",
    description: "Update time entries",
    category: "time_tracking",
    module: "timetracking",
  },
  {
    key: "time_tracking.delete",
    name: "Delete Time Entries",
    description: "Delete time entries",
    category: "time_tracking",
    module: "timetracking",
  },
  // Todos
  {
    key: "todos.view",
    name: "View Todos",
    description: "View todos",
    category: "todos",
    module: "todos",
  },
  {
    key: "todos.create",
    name: "Create Todos",
    description: "Create new todos",
    category: "todos",
    module: "todos",
  },
  {
    key: "todos.update",
    name: "Update Todos",
    description: "Update existing todos",
    category: "todos",
    module: "todos",
  },
  {
    key: "todos.delete",
    name: "Delete Todos",
    description: "Delete todos",
    category: "todos",
    module: "todos",
  },
  {
    key: "todos.assign",
    name: "Assign Todos",
    description: "Assign todos to other users",
    category: "todos",
    module: "todos",
  },
  // Admin
  {
    key: "admin.users.view",
    name: "View Users",
    description: "View user list",
    category: "admin",
  },
  {
    key: "admin.users.create",
    name: "Create Users",
    description: "Create new users",
    category: "admin",
  },
  {
    key: "admin.users.update",
    name: "Update Users",
    description: "Update user details",
    category: "admin",
  },
  {
    key: "admin.users.delete",
    name: "Delete Users",
    description: "Delete users",
    category: "admin",
  },
  {
    key: "admin.groups.manage",
    name: "Manage Groups",
    description: "Create/edit/delete groups and assign permissions",
    category: "admin",
  },
  {
    key: "admin.permissions.view",
    name: "View Permissions",
    description: "View user and group permissions (read-only)",
    category: "admin",
  },
  {
    key: "admin.permissions.manage",
    name: "Manage Permissions",
    description: "View and manage user and group permissions",
    category: "admin",
  },
  {
    key: "admin.settings.manage",
    name: "Manage Settings",
    description: "Modify system settings",
    category: "admin",
  },
  {
    key: "admin.modules.manage",
    name: "Manage Modules",
    description: "Enable/disable modules",
    category: "admin",
  },
  {
    key: "admin.sessions.view",
    name: "View Sessions",
    description: "View user sessions",
    category: "admin",
  },
  {
    key: "admin.statistics.view",
    name: "View Statistics",
    description: "View system statistics",
    category: "admin",
  },
  {
    key: "admin.tickets.manage",
    name: "Manage All Tickets",
    description: "Full ticket management (admin view)",
    category: "admin",
  },
  {
    key: "admin.db.view",
    name: "View Database Explorer",
    description: "Access to the database explorer page",
    category: "admin",
  },
  {
    key: "admin.db.view_entries",
    name: "View Database Entries",
    description: "View entries in database tables",
    category: "admin",
  },
  {
    key: "admin.db.edit_entries",
    name: "Edit Database Entries",
    description: "Edit entries in database tables",
    category: "admin",
  },
  {
    key: "admin.db.delete_entries",
    name: "Delete Database Entries",
    description: "Delete entries from database tables",
    category: "admin",
  },
  {
    key: "admin.db.query",
    name: "Execute Database Queries",
    description: "Execute SQL queries in the database explorer",
    category: "admin",
  },
  {
    key: "audit.view",
    name: "View Audit Log",
    description: "View application audit log (who did what, when)",
    category: "admin",
  },
  {
    key: "audit.export",
    name: "Export Audit Log",
    description: "Export audit log data",
    category: "admin",
  },
  // Module Visibility
  {
    key: "modules.tickets.view",
    name: "View Tickets Module",
    description: "Access to the Tickets module in navigation and dashboard",
    category: "modules",
    module: "tickets",
  },
  {
    key: "modules.timetracking.view",
    name: "View Time Tracking Module",
    description: "Access to the Time Tracking module in navigation and dashboard",
    category: "modules",
    module: "timetracking",
  },
  {
    key: "modules.todos.view",
    name: "View ToDo Module",
    description: "Access to the ToDo module in navigation and dashboard",
    category: "modules",
    module: "todos",
  },
  // Links
  {
    key: "links.view",
    name: "View Links",
    description: "View bookmarks and links",
    category: "links",
    module: "links",
  },
  {
    key: "links.view_all",
    name: "View All Links",
    description: "View all links regardless of ownership",
    category: "links",
    module: "links",
  },
  {
    key: "links.create",
    name: "Create Links",
    description: "Create new bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "links.update",
    name: "Update Links",
    description: "Update existing bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "links.delete",
    name: "Delete Links",
    description: "Delete bookmarks",
    category: "links",
    module: "links",
  },
  {
    key: "links.share",
    name: "Share Links",
    description: "Share individual links with other users",
    category: "links",
    module: "links",
  },
  {
    key: "links.import",
    name: "Import Links",
    description: "Bulk import links from JSON or CSV",
    category: "links",
    module: "links",
  },
  {
    key: "links.export",
    name: "Export Links",
    description: "Bulk export links to JSON or CSV",
    category: "links",
    module: "links",
  },
  {
    key: "links.archive",
    name: "Archive Links",
    description: "Archive and unarchive links",
    category: "links",
    module: "links",
  },
  {
    key: "collections.view",
    name: "View Collections",
    description: "View link collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.create",
    name: "Create Collections",
    description: "Create new link collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.update",
    name: "Update Collections",
    description: "Update existing collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.delete",
    name: "Delete Collections",
    description: "Delete collections",
    category: "links",
    module: "links",
  },
  {
    key: "collections.share",
    name: "Share Collections",
    description: "Share collections with other users",
    category: "links",
    module: "links",
  },
  {
    key: "modules.links.view",
    name: "View Links Module",
    description: "Access to the Links module in navigation and dashboard",
    category: "modules",
    module: "links",
  },
];

/**
 * Get permission by key
 */
export function getPermission(key: PermissionKey): PermissionDefinition | undefined {
  return PERMISSIONS.find((p) => p.key === key);
}

/**
 * Get permissions by category
 */
export function getPermissionsByCategory(category: string): PermissionDefinition[] {
  return PERMISSIONS.filter((p) => p.category === category);
}

/**
 * Get all permission categories
 */
export function getPermissionCategories(): string[] {
  return Array.from(new Set(PERMISSIONS.map((p) => p.category)));
}

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  // Roles are purely categorical; no default permissions are granted by role.
  // All permissions must be assigned explicitly via groups or user-specific assignments.
  ADMIN: [],
  MODERATOR: [],
  AGENT: [],
  USER: [],
};
