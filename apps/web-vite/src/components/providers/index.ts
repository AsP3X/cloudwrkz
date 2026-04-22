// Human: Barrel re-export for top-level React providers wired near the app root.
// Agent: RE-EXPORTS ThemeProvider, AuthProvider, ErrorBoundary and their hooks where applicable.
export { ThemeProvider, useTheme } from "./ThemeProvider";
export { AuthProvider, useAuth } from "./AuthProvider";
export { ErrorBoundary } from "./ErrorBoundary";
