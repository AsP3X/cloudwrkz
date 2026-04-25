// Human: This barrel file re-exports AdminDashboard from the `AdminDashboard` folder so callers can import them through one path while working on administration and permission management.
// Agent: SCOPE admin; UI permissions; RE-EXPORTS AdminDashboard; NO runtime logic in this file.
export { AdminDashboard } from "./AdminDashboard";
