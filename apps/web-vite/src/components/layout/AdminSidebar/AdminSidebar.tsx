import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { useSidebar } from "../SidebarContext";
import { CollapsibleNavSection } from "@/components/ui/CollapsibleNavSection";
import {
  IconDepartments,
  IconDirectory,
  IconDocuments,
  IconLeave,
  IconMyTime,
  IconOrgChart,
  IconPerformance,
  IconVacation,
} from "../sidebarNavIcons";

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const TicketsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const TodosIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const LinksIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const ArchiveIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20 7l-2 12H6L4 7m16 0H4m16 0l-1-3H5L4 7m6 4h4"
    />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const DatabaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);

const ClipboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const CubeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const QueueIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h10" />
  </svg>
);

const EmployeesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m8-6.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0zM6 10a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

export interface AdminSidebarProps {
  enabledModuleKeys: string[];
  canViewUsers: boolean;
  canManageGroups: boolean;
  canViewSessions: boolean;
  canViewPermissions: boolean;
  canManagePermissions: boolean;
  canViewStatistics: boolean;
  canManageModules: boolean;
  canViewAuditLog: boolean;
  canViewDbConsole: boolean;
  canManageSettings: boolean;
  /** View admin Background Jobs (queue + detail); also allow legacy access via Manage Settings. */
  canViewBackgroundJobs: boolean;
}

export function AdminSidebar({
  enabledModuleKeys,
  canViewUsers,
  canManageGroups,
  canViewSessions,
  canViewPermissions,
  canManagePermissions,
  canViewStatistics,
  canManageModules,
  canViewAuditLog,
  canViewDbConsole,
  canManageSettings,
  canViewBackgroundJobs,
}: AdminSidebarProps) {
  const pathname = useLocation().pathname;
  const { isMobileOpen, setIsMobileOpen, toolbarCompact } = useSidebar();
  const enabledSet = new Set(enabledModuleKeys);

  const moduleWorkItems = [
    { name: "Links", href: ROUTES.LINKS, icon: LinksIcon, key: "links" },
    { name: "Tickets", href: "/dashboard/tickets", icon: TicketsIcon, key: "tickets" },
    { name: "ToDo", href: "/dashboard/todos", icon: TodosIcon, key: "todos" },
  ].filter((item) => enabledSet.has(item.key));

  // Human: Employees sub-nav items are admin-visible regardless of module key so admin can always reach the section.
  // Agent: adminVisible items bypass enabledSet check; employees section shows all sub-pages.
  const employeeItems = [
    { name: "Directory", href: ROUTES.EMPLOYEES, icon: IconDirectory, key: "employees", adminVisible: true },
    { name: "Org Chart", href: ROUTES.EMPLOYEES_ORG_CHART, icon: IconOrgChart, key: "employees", adminVisible: true },
    { name: "Departments", href: ROUTES.EMPLOYEES_DEPARTMENTS, icon: IconDepartments, key: "employees", adminVisible: true },
    { name: "Performance", href: ROUTES.EMPLOYEES_PERFORMANCE, icon: IconPerformance, key: "employees", adminVisible: true },
    { name: "Documents", href: ROUTES.EMPLOYEES_DOCUMENTS, icon: IconDocuments, key: "employees", adminVisible: true },
  ].filter((item) => item.adminVisible || enabledSet.has(item.key));

  const timeAndLeaveMyTime = enabledSet.has("time_tracking")
    ? { name: "My time", href: ROUTES.TIME_TRACKING, icon: IconMyTime }
    : null;
  const timeAndLeaveItems = [
    { name: "Leave", href: ROUTES.EMPLOYEES_LEAVE, icon: IconLeave, adminVisible: true },
    { name: "Vacation Planner", href: ROUTES.EMPLOYEES_VACATION, icon: IconVacation, adminVisible: true },
  ].filter((item) => item.adminVisible || enabledSet.has("employees"));

  const workItems = [
    ...moduleWorkItems,
    { name: "Archive", href: ROUTES.ARCHIVE, icon: ArchiveIcon },
  ];

  const userMgmtItems = [
    canViewUsers && { name: "Users", href: ROUTES.ADMIN_USERS, icon: UsersIcon },
    canManageGroups && { name: "Groups", href: ROUTES.ADMIN_GROUPS, icon: UsersIcon },
    canViewSessions && { name: "Sessions", href: ROUTES.ADMIN_SESSIONS, icon: ClipboardIcon },
  ].filter(Boolean) as { name: string; href: string; icon: () => JSX.Element }[];

  const permissionsItems = (canViewPermissions || canManagePermissions)
    ? [
        { name: "Groups", href: "/dashboard/admin/permissions/groups", icon: UsersIcon },
        { name: "Users", href: "/dashboard/admin/permissions/users", icon: UsersIcon },
      ]
    : [];

  const systemItems = [
    canViewStatistics && { name: "Statistics", href: ROUTES.ADMIN_STATISTICS, icon: ChartIcon },
    canManageModules && { name: "Modules", href: ROUTES.ADMIN_MODULES, icon: CubeIcon },
    canViewAuditLog && { name: "Audit Log", href: ROUTES.ADMIN_AUDIT, icon: ClipboardIcon },
    canViewDbConsole && { name: "Database Console", href: ROUTES.ADMIN_DB_CONSOLE, icon: DatabaseIcon },
    canManageSettings && { name: "System Settings", href: ROUTES.ADMIN_SETTINGS, icon: SettingsIcon },
    canViewBackgroundJobs && { name: "Jobs", href: ROUTES.ADMIN_BACKGROUND_JOBS, icon: QueueIcon },
  ].filter(Boolean) as { name: string; href: string; icon: () => JSX.Element }[];

  const hrefIsActive = (href: string) => {
    if (href === ROUTES.EMPLOYEES) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const userMgmtHasActive = userMgmtItems.some((item) => hrefIsActive(item.href));
  const permissionsHasActive = permissionsItems.some((item) => hrefIsActive(item.href));
  const systemHasActive = systemItems.some((item) => hrefIsActive(item.href));
  const employeeHasActive = employeeItems.some((item) => hrefIsActive(item.href));
  const timeAndLeaveHasActive =
    Boolean(timeAndLeaveMyTime && hrefIsActive(timeAndLeaveMyTime.href)) ||
    timeAndLeaveItems.some((item) => hrefIsActive(item.href));

  const NavLink = ({ item, icon: Icon }: { item: { name: string; href: string }; icon: () => JSX.Element }) => {
    const isActive = hrefIsActive(item.href);
    return (
      <Link
        to={item.href}
        onClick={() => setIsMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
            : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
        )}
      >
        <span className={cn(isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400")}>
          <Icon />
        </span>
        <span className="flex-1 truncate">{item.name}</span>
      </Link>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-white/92 backdrop-blur-md transition-transform duration-300 ease-in-out dark:bg-neutral-950/90",
          "lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {isMobileOpen && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden fixed top-4 z-50 rounded-lg border border-white/20 bg-white/92 p-2 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/90"
            aria-label="Close sidebar"
            style={{ left: "calc(16rem + 1rem)" }}
          >
            <svg className="w-6 h-6 text-neutral-700 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="flex flex-col h-full">
          <div
            className={cn(
              "flex items-center gap-2 border-b border-white/15 px-6 transition-[height,gap,padding] duration-300 ease-out dark:border-white/10",
              toolbarCompact ? "h-12 gap-1.5 px-5" : "h-16 px-6",
            )}
          >
            <Link
              to={ROUTES.DASHBOARD}
              className={cn(
                "min-w-0 truncate font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent transition-[font-size] duration-300 ease-out",
                toolbarCompact ? "text-lg" : "text-xl",
              )}
            >
              {APP_CONFIG.name}
            </Link>
            <span
              className={cn(
                "shrink-0 rounded bg-primary-100 font-medium text-primary-700 transition-[font-size,padding] duration-300 ease-out dark:bg-primary-900 dark:text-primary-300",
                toolbarCompact ? "px-1.5 py-0.5 text-[0.625rem]" : "px-2 py-0.5 text-xs",
              )}
            >
              Admin
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-r border-white/20 dark:border-white/10">
          <nav className="flex-1 space-y-4 overflow-y-auto px-4 py-6 scrollbar-sidebar">
            <Link
              to={ROUTES.DASHBOARD}
              onClick={() => setIsMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                pathname === ROUTES.DASHBOARD
                  ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
              )}
            >
              <DashboardIcon />
              Dashboard
            </Link>

            {workItems.length > 0 && (
              <CollapsibleNavSection title="Work" icon={<TicketsIcon />} defaultExpanded={workItems.some((item) => hrefIsActive(item.href))}>
                {workItems.map((item) => (
                  <NavLink key={item.href} item={item} icon={item.icon} />
                ))}
              </CollapsibleNavSection>
            )}

            {employeeItems.length > 0 && (
              <CollapsibleNavSection title="HR - Employees" icon={<EmployeesIcon />} defaultExpanded={employeeHasActive}>
                {employeeItems.map((item) => (
                  <NavLink key={item.href} item={item} icon={item.icon} />
                ))}
              </CollapsibleNavSection>
            )}

            {(timeAndLeaveMyTime != null || timeAndLeaveItems.length > 0) && (
              <CollapsibleNavSection title="Time & leave" icon={<IconMyTime />} defaultExpanded={timeAndLeaveHasActive}>
                {[...(timeAndLeaveMyTime ? [timeAndLeaveMyTime] : []), ...timeAndLeaveItems].map((item, index) => {
                  const isActive = hrefIsActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${item.href}-${index}`}
                      to={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                          : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
                      )}
                    >
                      <span className={cn(isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400")}>
                        <Icon />
                      </span>
                      <span className="flex-1 truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </CollapsibleNavSection>
            )}

            {userMgmtItems.length > 0 && (
              <CollapsibleNavSection title="User Management" icon={<UsersIcon />} defaultExpanded={userMgmtHasActive}>
                {userMgmtItems.map((item) => (
                  <NavLink key={item.href} item={item} icon={item.icon} />
                ))}
              </CollapsibleNavSection>
            )}

            {permissionsItems.length > 0 && (
              <CollapsibleNavSection title="Permissions" icon={<SettingsIcon />} defaultExpanded={permissionsHasActive}>
                {permissionsItems.map((item) => (
                  <NavLink key={item.href} item={item} icon={item.icon} />
                ))}
              </CollapsibleNavSection>
            )}

            {systemItems.length > 0 && (
              <CollapsibleNavSection title="System" icon={<CubeIcon />} defaultExpanded={systemHasActive}>
                {systemItems.map((item) => (
                  <NavLink key={item.href} item={item} icon={item.icon} />
                ))}
              </CollapsibleNavSection>
            )}
          </nav>

          <div className="border-t border-white/15 px-4 py-4 dark:border-white/10">
            <Link
              to={ROUTES.HOME}
              className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </Link>
          </div>
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <div role="presentation" className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setIsMobileOpen(false)} />
      )}
    </>
  );
}
