// Human: This barrel re-exports every routed page component so imports stay stable and tree-shaking stays predictable.
// Agent: RE-EXPORTS default page modules; NO side effects; ROUTER CONSUMES named exports from single entry.

export { default as HomePage } from "./HomePage";
export { default as LoginPage } from "./LoginPage";
export { default as RegisterPage } from "./RegisterPage";
export { default as AboutPage } from "./AboutPage";
export { default as ContactPage } from "./ContactPage";
export { default as NotFoundPage } from "./NotFoundPage";
export { default as TermsPage } from "./TermsPage";
export { default as PrivacyPage } from "./PrivacyPage";
export { default as HealthPage } from "./HealthPage";
export { default as BannedPage } from "./BannedPage";
export { default as QrLoginPage } from "./QrLoginPage";

export { default as DashboardHomePage } from "./dashboard/DashboardHomePage";
export { default as TicketsPage } from "./dashboard/TicketsPage";
export { default as TicketNewPage } from "./dashboard/TicketNewPage";
export { default as TicketDetailPage } from "./dashboard/TicketDetailPage";
export { default as TicketEditPage } from "./dashboard/TicketEditPage";
export { default as TodosPage } from "./dashboard/TodosPage";
export { default as TodoNewPage } from "./dashboard/TodoNewPage";
export { default as TaskDetailPage } from "./dashboard/TaskDetailPage";
export { default as TodoEditPage } from "./dashboard/TodoEditPage";
export { default as TodosArchivePage } from "./dashboard/TodosArchivePage";
export { default as LinksPage } from "./dashboard/LinksPage";
export { default as LinksArchivePage } from "./dashboard/LinksArchivePage";
export { default as LinkDetailPage } from "./dashboard/LinkDetailPage";
export { default as LinkEditPage } from "./dashboard/LinkEditPage";
export { default as CollectionDetailPage } from "./dashboard/CollectionDetailPage";
export { default as TimeTrackingPage } from "./dashboard/TimeTrackingPage";
export { default as TimeEntryDetailPage } from "./dashboard/TimeEntryDetailPage";
export { default as ProfilePage } from "./dashboard/ProfilePage";
export { default as SettingsPage } from "./dashboard/SettingsPage";
export { default as SearchPage } from "./dashboard/SearchPage";
export { default as NotificationsPage } from "./dashboard/NotificationsPage";
export { default as StatisticsPage } from "./dashboard/StatisticsPage";
export { default as ArchivePage } from "./dashboard/ArchivePage";
export { default as UserViewPage } from "./dashboard/UserViewPage";

export { default as UsersPage } from "./dashboard/admin/UsersPage";
export { default as GroupsPage } from "./dashboard/admin/GroupsPage";
export { default as GroupDetailPage } from "./dashboard/admin/GroupDetailPage";
export { default as ModulesPage } from "./dashboard/admin/ModulesPage";
export { default as AdminSettingsPage } from "./dashboard/admin/AdminSettingsPage";
export { default as AdminBackgroundJobsPage } from "./dashboard/admin/AdminBackgroundJobsPage";
export { default as SessionsPage } from "./dashboard/admin/SessionsPage";
export { default as AdminTicketsPage } from "./dashboard/admin/AdminTicketsPage";
export { default as AdminStatisticsPage } from "./dashboard/admin/AdminStatisticsPage";
export { default as AuditPage } from "./dashboard/admin/AuditPage";
export { default as DbConsolePage } from "./dashboard/admin/DbConsolePage";
export { default as UserDetailPage } from "./dashboard/admin/UserDetailPage";
export { default as UserPermissionsListPage } from "./dashboard/admin/permissions/UserPermissionsListPage";
export { default as UserPermissionDetailPage } from "./dashboard/admin/permissions/UserPermissionDetailPage";
export { default as GroupPermissionsListPage } from "./dashboard/admin/permissions/GroupPermissionsListPage";
export { default as GroupPermissionDetailPage } from "./dashboard/admin/permissions/GroupPermissionDetailPage";
