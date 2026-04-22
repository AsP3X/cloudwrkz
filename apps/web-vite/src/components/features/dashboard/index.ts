// Human: This barrel file re-exports 15 symbols including WelcomeHero, QuickNavChips, QuickNavItem, … from the `dashboard` folder so callers can import them through one path while working on the signed-in home dashboard.
// Agent: SCOPE dashboard; WIDGETS shortcuts activity todos; RE-EXPORTS WelcomeHero, QuickNavChips, QuickNavItem, DashboardStatCard, ShortcutsSection, ShortcutItem, RecentActivityPanel, RecentItem, RecentSection, DashboardTodoWidget, DashboardTodoItem, DashboardNotificationsAlerts; …; NO runtime logic in this file.
export { WelcomeHero } from "./WelcomeHero";
export { QuickNavChips } from "./QuickNavChips";
export type { QuickNavItem } from "./QuickNavChips";
export { DashboardStatCard } from "./DashboardStatCard";
export { ShortcutsSection } from "./ShortcutsSection";
export type { ShortcutItem } from "./ShortcutsSection";
export { RecentActivityPanel } from "./RecentActivityPanel";
export type { RecentItem, RecentSection } from "./RecentActivityPanel";
export { DashboardTodoWidget } from "./DashboardTodoWidget";
export type { DashboardTodoItem } from "./DashboardTodoWidget";
export { DashboardNotificationsAlerts } from "./DashboardNotificationsAlerts";
export type { DashboardAlert } from "./DashboardNotificationsAlerts";
export { DashboardPinnedFavorites } from "./DashboardPinnedFavorites";
export type { DashboardFavoriteItem } from "./DashboardPinnedFavorites";
