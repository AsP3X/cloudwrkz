import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";
import { DatabaseHealthProvider, useDatabaseHealthContext } from "@/components/providers/DatabaseHealthProvider";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ROUTES } from "@/lib/constants/routes";
import { DatabaseWarning } from "@/components/ui/DatabaseWarning";
import { OfflineWarning } from "@/components/ui/OfflineWarning";

import {
  HomePage,
  LoginPage,
  RegisterPage,
  AboutPage,
  ContactPage,
  NotFoundPage,
  TermsPage,
  PrivacyPage,
  HealthPage,
  BannedPage,
  QrLoginPage,
  DashboardHomePage,
  TicketsPage,
  TicketNewPage,
  TicketDetailPage,
  TicketEditPage,
  TodosPage,
  TodoNewPage,
  TaskDetailPage,
  TodoEditPage,
  TodosArchivePage,
  LinksPage,
  LinksArchivePage,
  LinkDetailPage,
  LinkEditPage,
  CollectionDetailPage,
  EmployeesPage,
  EmployeeCreatePage,
  EmployeeDetailPage,
  EmployeeEditPage,
  EmployeeOrgChartPage,
  EmployeeLeavePage,
  EmployeePerformancePage,
  EmployeeDocumentsPage,
  EmployeeVacationPlannerPage,
  TimeTrackingPage,
  TimeEntryDetailPage,
  ProfilePage,
  SettingsPage,
  SearchPage,
  NotificationsPage,
  StatisticsPage,
  ArchivePage,
  UserViewPage,
  UsersPage,
  GroupsPage,
  GroupDetailPage,
  ModulesPage,
  AdminSettingsPage,
  AdminBackgroundJobsPage,
  SessionsPage,
  AdminTicketsPage,
  AdminStatisticsPage,
  AuditPage,
  DbConsolePage,
  UserDetailPage,
  UserPermissionsListPage,
  UserPermissionDetailPage,
  GroupPermissionsListPage,
  GroupPermissionDetailPage,
} from "@/pages";

function AppBanners() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isRetryingHealth, setIsRetryingHealth] = useState(false);
  const health = useDatabaseHealthContext();

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const showDbWarning = Boolean(
    health &&
    isOnline &&
    health.status !== "healthy" &&
    health.status !== "degraded" &&
    health.status !== "loading"
  );

  const retryHealthCheck = async () => {
    if (!health || isRetryingHealth) return;
    setIsRetryingHealth(true);
    const minVisibleMs = 5000;
    const minDelay = new Promise<void>((resolve) => {
      window.setTimeout(resolve, minVisibleMs);
    });
    try {
      await Promise.all([health.checkHealth(), minDelay]);
    } finally {
      setIsRetryingHealth(false);
    }
  };

  const showAnyBanner = !isOnline || showDbWarning;

  return (
    <>
      {/* Below fixed/sticky navbars (Header + DashboardHeader use h-16) */}
      {showAnyBanner && (
        <div
          className="fixed left-0 right-0 top-16 z-[105] flex w-full flex-col"
          role="region"
          aria-label="Site notices"
        >
          {!isOnline && <OfflineWarning />}
          {showDbWarning && (
            <DatabaseWarning
              isServerUnreachable={health?.isServerUnreachable}
              error={health?.error}
              onRetry={retryHealthCheck}
              isRetrying={isRetryingHealth}
            />
          )}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <DatabaseHealthProvider>
              <AppBanners />
              <Routes>
                {/* Public routes */}
                <Route path={ROUTES.HOME} element={<HomePage />} />
                <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
                <Route path={ROUTES.ABOUT} element={<AboutPage />} />
                <Route path={ROUTES.CONTACT} element={<ContactPage />} />
                <Route path={ROUTES.TERMS} element={<TermsPage />} />
                <Route path={ROUTES.PRIVACY} element={<PrivacyPage />} />
                <Route path={ROUTES.HEALTH} element={<HealthPage />} />
                <Route path={ROUTES.BANNED} element={<BannedPage />} />
                <Route path={ROUTES.QR_LOGIN} element={<QrLoginPage />} />

                {/* Dashboard routes - wrapped in DashboardLayout */}
                <Route path={ROUTES.DASHBOARD} element={<DashboardLayout />}>
                  <Route index element={<DashboardHomePage />} />
                  <Route path="tickets" element={<TicketsPage />} />
                  <Route path="tickets/new" element={<TicketNewPage />} />
                  <Route path="tickets/:id" element={<TicketDetailPage />} />
                  <Route path="tickets/:id/edit" element={<TicketEditPage />} />
                  <Route path="todos" element={<TodosPage />} />
                  <Route path="todos/new" element={<TodoNewPage />} />
                  <Route path="todos/:id" element={<TaskDetailPage />} />
                  <Route path="todos/:id/edit" element={<TodoEditPage />} />
                  <Route path="todos/archive" element={<TodosArchivePage />} />
                  <Route path="links" element={<LinksPage />} />
                  <Route path="links/archive" element={<LinksArchivePage />} />
                  <Route path="links/:id" element={<LinkDetailPage />} />
                  <Route path="links/:id/edit" element={<LinkEditPage />} />
                  <Route path="links/collections/:id" element={<CollectionDetailPage />} />
                  <Route path="employees" element={<EmployeesPage />} />
                  <Route path="employees/new" element={<EmployeeCreatePage />} />
                  <Route path="employees/org-chart" element={<EmployeeOrgChartPage />} />
                  <Route path="employees/leave" element={<EmployeeLeavePage />} />
                  <Route path="employees/performance" element={<EmployeePerformancePage />} />
                  <Route path="employees/documents" element={<EmployeeDocumentsPage />} />
                  <Route path="employees/vacation" element={<EmployeeVacationPlannerPage />} />
                  <Route path="employees/:id" element={<EmployeeDetailPage />} />
                  <Route path="employees/:id/edit" element={<EmployeeEditPage />} />
                  <Route path="time-tracking" element={<TimeTrackingPage />} />
                  <Route path="time-tracking/:id" element={<TimeEntryDetailPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="search" element={<SearchPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="statistics" element={<StatisticsPage />} />
                  <Route path="archive" element={<ArchivePage />} />

                  {/* Admin routes */}
                  <Route path="users/:id" element={<UserViewPage />} />
                  <Route path="admin">
                    <Route path="users" element={<UsersPage />} />
                    <Route path="users/:id" element={<UserDetailPage />} />
                    <Route path="groups" element={<GroupsPage />} />
                    <Route path="groups/:id" element={<GroupDetailPage />} />
                    <Route path="modules" element={<ModulesPage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />
                    <Route path="background-jobs" element={<AdminBackgroundJobsPage />} />
                    <Route path="sessions" element={<SessionsPage />} />
                    <Route path="tickets" element={<AdminTicketsPage />} />
                    <Route path="statistics" element={<AdminStatisticsPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="db" element={<DbConsolePage />} />
                    <Route path="permissions">
                      <Route path="users" element={<UserPermissionsListPage />} />
                      <Route path="users/:id" element={<UserPermissionDetailPage />} />
                      <Route path="groups" element={<GroupPermissionsListPage />} />
                      <Route path="groups/:id" element={<GroupPermissionDetailPage />} />
                    </Route>
                  </Route>
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </DatabaseHealthProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
