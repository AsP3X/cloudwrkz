/**
 * Application route constants
 * These are used throughout the application to ensure consistent routing
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  BANNED: "/banned",
  TERMS: "/terms",
  PRIVACY: "/privacy",
  ABOUT: "/about",
  CONTACT: "/contact",
  HEALTH: "/health",
  // Agent routes
  AGENT_STATISTICS: "/dashboard/statistics",
  // Admin routes
  ADMIN_USERS: "/dashboard/admin/users",
  ADMIN_MODULES: "/dashboard/admin/modules",
  ADMIN_GROUPS: "/dashboard/admin/groups",
  ADMIN_SETTINGS: "/dashboard/admin/settings",
  ADMIN_STATISTICS: "/dashboard/admin/statistics",
  ADMIN_SESSIONS: "/dashboard/admin/sessions",
  ADMIN_TICKETS: "/dashboard/admin/tickets",
  ADMIN_DB_CONSOLE: "/dashboard/admin/db",
  // Time tracking
  TIME_TRACKING: "/dashboard/time-tracking",
  // Todos
  TODOS: "/dashboard/todos",
} as const;

// Export individual routes for better tree-shaking and to ensure they're always available
export const ABOUT_ROUTE = "/about";
export const CONTACT_ROUTE = "/contact";
