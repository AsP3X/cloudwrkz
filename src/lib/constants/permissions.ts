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
  // Projects
  | "projects.view"
  | "projects.view_all"
  | "projects.create"
  | "projects.update"
  | "projects.delete"
  | "projects.manage_members"
  | "projects.manage_groups"
  // Time Tracking
  | "time_tracking.view"
  | "time_tracking.view_all"
  | "time_tracking.create"
  | "time_tracking.update"
  | "time_tracking.delete"
  // Tasks
  | "tasks.view"
  | "tasks.create"
  | "tasks.update"
  | "tasks.delete"
  // Risks
  | "risks.view"
  | "risks.create"
  | "risks.update"
  | "risks.delete"
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
  | "admin.settings.manage"
  | "admin.modules.manage"
  | "admin.sessions.view"
  | "admin.statistics.view"
  | "admin.tickets.manage"
  // Module Visibility
  | "modules.tickets.view"
  | "modules.timetracking.view"
  | "modules.projects.view";

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
  // Projects
  {
    key: "projects.view",
    name: "View Projects",
    description: "View projects user is a member of",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.view_all",
    name: "View All Projects",
    description: "View all projects",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.create",
    name: "Create Projects",
    description: "Create new projects",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.update",
    name: "Update Projects",
    description: "Update project details",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.delete",
    name: "Delete Projects",
    description: "Delete projects",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.manage_members",
    name: "Manage Project Members",
    description: "Add/remove project members",
    category: "projects",
    module: "projects",
  },
  {
    key: "projects.manage_groups",
    name: "Manage Project Groups",
    description: "Assign groups to projects",
    category: "projects",
    module: "projects",
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
  // Tasks
  {
    key: "tasks.view",
    name: "View Tasks",
    description: "View tasks in accessible projects",
    category: "tasks",
    module: "projects",
  },
  {
    key: "tasks.create",
    name: "Create Tasks",
    description: "Create new tasks",
    category: "tasks",
    module: "projects",
  },
  {
    key: "tasks.update",
    name: "Update Tasks",
    description: "Update existing tasks",
    category: "tasks",
    module: "projects",
  },
  {
    key: "tasks.delete",
    name: "Delete Tasks",
    description: "Delete tasks",
    category: "tasks",
    module: "projects",
  },
  // Risks
  {
    key: "risks.view",
    name: "View Risks",
    description: "View project risks",
    category: "risks",
    module: "projects",
  },
  {
    key: "risks.create",
    name: "Create Risks",
    description: "Create new risks",
    category: "risks",
    module: "projects",
  },
  {
    key: "risks.update",
    name: "Update Risks",
    description: "Update existing risks",
    category: "risks",
    module: "projects",
  },
  {
    key: "risks.delete",
    name: "Delete Risks",
    description: "Delete risks",
    category: "risks",
    module: "projects",
  },
  // Issues
  {
    key: "issues.view",
    name: "View Issues",
    description: "View project issues",
    category: "issues",
    module: "projects",
  },
  {
    key: "issues.create",
    name: "Create Issues",
    description: "Create new issues",
    category: "issues",
    module: "projects",
  },
  {
    key: "issues.update",
    name: "Update Issues",
    description: "Update existing issues",
    category: "issues",
    module: "projects",
  },
  {
    key: "issues.delete",
    name: "Delete Issues",
    description: "Delete issues",
    category: "issues",
    module: "projects",
  },
  // Notes
  {
    key: "notes.view",
    name: "View Notes",
    description: "View project notes",
    category: "notes",
    module: "projects",
  },
  {
    key: "notes.create",
    name: "Create Notes",
    description: "Create new notes",
    category: "notes",
    module: "projects",
  },
  {
    key: "notes.update",
    name: "Update Notes",
    description: "Update existing notes",
    category: "notes",
    module: "projects",
  },
  {
    key: "notes.delete",
    name: "Delete Notes",
    description: "Delete notes",
    category: "notes",
    module: "projects",
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
    key: "modules.projects.view",
    name: "View Projects Module",
    description: "Access to the Projects module in navigation and dashboard",
    category: "modules",
    module: "projects",
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

/**
 * Role-based default permissions
 */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  ADMIN: PERMISSIONS.map((p) => p.key), // Admins have all permissions
  MODERATOR: [
    // Tickets
    "tickets.view",
    "tickets.view_all",
    "tickets.create",
    "tickets.update",
    "tickets.delete",
    "tickets.assign",
    "tickets.comment",
    "tickets.time_entries.view",
    "tickets.time_entries.create",
    // Projects
    "projects.view",
    "projects.view_all",
    "projects.create",
    "projects.update",
    "projects.delete",
    "projects.manage_members",
    "projects.manage_groups",
    // Time Tracking
    "time_tracking.view",
    "time_tracking.view_all",
    "time_tracking.create",
    "time_tracking.update",
    "time_tracking.delete",
    // Tasks
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    // Risks
    "risks.view",
    "risks.create",
    "risks.update",
    "risks.delete",
    // Issues
    "issues.view",
    "issues.create",
    "issues.update",
    "issues.delete",
    // Notes
    "notes.view",
    "notes.create",
    "notes.update",
    "notes.delete",
    // Admin (limited)
    "admin.users.view",
    "admin.groups.manage",
    "admin.sessions.view",
    "admin.statistics.view",
    "admin.tickets.manage",
    // Module Visibility
    "modules.tickets.view",
    "modules.timetracking.view",
    "modules.projects.view",
  ],
  AGENT: [
    // Tickets
    "tickets.view",
    "tickets.create",
    "tickets.update",
    "tickets.comment",
    "tickets.time_entries.view",
    "tickets.time_entries.create",
    // Time Tracking
    "time_tracking.view",
    "time_tracking.create",
    "time_tracking.update",
    // Projects (limited - only assigned)
    "projects.view",
    // Tasks (limited - only in assigned projects)
    "tasks.view",
    "tasks.create",
    "tasks.update",
    // Module Visibility
    "modules.tickets.view",
    "modules.timetracking.view",
    "modules.projects.view",
  ],
  USER: [
    // Default users have no permissions - they must be added to groups to get permissions
    // This ensures that permissions are explicitly granted through group membership
  ],
};
