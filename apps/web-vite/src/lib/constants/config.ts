// Human: Branding metadata pulled from Vite env so marketing pages can show the configured product name consistently.
// Agent: READS VITE_APP_NAME; EXPORTS APP_CONFIG const; STATIC version string; NO secrets.

export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || "CloudWrkz",
  description: "Modern enterprise application",
  version: "0.1.0",
} as const;
