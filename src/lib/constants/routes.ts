/**
 * Application route constants
 * These are used throughout the application to ensure consistent routing
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  TERMS: "/terms",
  PRIVACY: "/privacy",
  ABOUT: "/about",
  CONTACT: "/contact",
  // Admin routes
  ADMIN_USERS: "/dashboard/admin/users",
  ADMIN_MODULES: "/dashboard/admin/modules",
  ADMIN_GROUPS: "/dashboard/admin/groups",
  ADMIN_SETTINGS: "/dashboard/admin/settings",
} as const;

// Export individual routes for better tree-shaking and to ensure they're always available
export const ABOUT_ROUTE = "/about";
export const CONTACT_ROUTE = "/contact";
