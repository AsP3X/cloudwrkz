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
} as const;

// Export individual routes for better tree-shaking and to ensure they're always available
export const ABOUT_ROUTE = "/about";
export const CONTACT_ROUTE = "/contact";
