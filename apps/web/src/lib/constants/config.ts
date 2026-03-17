/**
 * Application configuration constants
 * The app name can be customized via NEXT_PUBLIC_APP_NAME environment variable
 */
export const APP_CONFIG = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "CloudWrkz",
  description: "Modern enterprise application",
  version: "0.1.0",
} as const;
