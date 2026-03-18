import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ROUTES } from "@/lib/constants/routes";

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
  DashboardHomePage,
  TicketsPage,
  TicketNewPage,
  TicketDetailPage,
  TodosPage,
  LinksPage,
  TimeTrackingPage,
  TimeEntryDetailPage,
  ProfilePage,
  SettingsPage,
  SearchPage,
  NotificationsPage,
  StatisticsPage,
  ArchivePage,
  UsersPage,
  GroupsPage,
  ModulesPage,
  AdminSettingsPage,
  SessionsPage,
  AdminTicketsPage,
  AdminStatisticsPage,
  AuditPage,
  DbConsolePage,
} from "@/pages";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
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

              {/* Dashboard routes - wrapped in DashboardLayout */}
              <Route path={ROUTES.DASHBOARD} element={<DashboardLayout />}>
                <Route index element={<DashboardHomePage />} />
                <Route path="tickets" element={<TicketsPage />} />
                <Route path="tickets/new" element={<TicketNewPage />} />
                <Route path="tickets/:id" element={<TicketDetailPage />} />
                <Route path="todos" element={<TodosPage />} />
                <Route path="links" element={<LinksPage />} />
                <Route path="time-tracking" element={<TimeTrackingPage />} />
                <Route path="time-tracking/:id" element={<TimeEntryDetailPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="statistics" element={<StatisticsPage />} />
                <Route path="archive" element={<ArchivePage />} />

                {/* Admin routes */}
                <Route path="admin">
                  <Route path="users" element={<UsersPage />} />
                  <Route path="groups" element={<GroupsPage />} />
                  <Route path="modules" element={<ModulesPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                  <Route path="sessions" element={<SessionsPage />} />
                  <Route path="tickets" element={<AdminTicketsPage />} />
                  <Route path="statistics" element={<AdminStatisticsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="db" element={<DbConsolePage />} />
                </Route>
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
