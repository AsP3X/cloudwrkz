import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { useSidebar } from "./SidebarContext";
import { CollapsibleNavSection } from "@/components/ui/CollapsibleNavSection";

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const StatisticsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

const TicketsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const TodosIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

const TimeTrackingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
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

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const LinksIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
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

type NavItem = {
  readonly name: string;
  readonly href: string;
  readonly icon: () => JSX.Element;
  readonly moduleKey?: string;
  readonly agentOnly?: boolean;
  readonly countKey?: "tickets" | "todos";
};

const STANDALONE_NAV_ITEMS = Object.freeze([
  Object.freeze({
    name: "Dashboard",
    href: ROUTES.DASHBOARD,
    icon: DashboardIcon,
  }),
]) as ReadonlyArray<NavItem>;

type NavSection = {
  readonly title: string;
  readonly icon: () => JSX.Element;
  readonly items: ReadonlyArray<NavItem>;
};

const NAV_SECTIONS = Object.freeze([
  Object.freeze({
    title: "Work",
    icon: TicketsIcon,
    items: Object.freeze([
      Object.freeze({
        name: "Tickets",
        href: "/dashboard/tickets",
        icon: TicketsIcon,
        moduleKey: "tickets",
        countKey: "tickets" as const,
      }),
      Object.freeze({
        name: "ToDo",
        href: "/dashboard/todos",
        icon: TodosIcon,
        moduleKey: "todos",
        countKey: "todos" as const,
      }),
    ]),
  }),
  Object.freeze({
    title: "Employees",
    icon: EmployeesIcon,
    items: Object.freeze([
      Object.freeze({
        name: "Directory",
        href: ROUTES.EMPLOYEES,
        icon: EmployeesIcon,
        moduleKey: "employees",
      }),
      Object.freeze({
        name: "Org Chart",
        href: ROUTES.EMPLOYEES_ORG_CHART,
        icon: EmployeesIcon,
        moduleKey: "employees",
      }),
      Object.freeze({
        name: "Leave",
        href: ROUTES.EMPLOYEES_LEAVE,
        icon: TimeTrackingIcon,
        moduleKey: "employees",
      }),
      Object.freeze({
        name: "Performance",
        href: ROUTES.EMPLOYEES_PERFORMANCE,
        icon: StatisticsIcon,
        moduleKey: "employees",
      }),
      Object.freeze({
        name: "Documents",
        href: ROUTES.EMPLOYEES_DOCUMENTS,
        icon: ArchiveIcon,
        moduleKey: "employees",
      }),
    ]),
  }),
  Object.freeze({
    title: "Time tracking",
    icon: TimeTrackingIcon,
    items: Object.freeze([
      Object.freeze({
        name: "My time",
        href: "/dashboard/time-tracking",
        icon: TimeTrackingIcon,
        moduleKey: "time_tracking",
      }),
    ]),
  }),
  Object.freeze({
    title: "Personal",
    icon: SettingsIcon,
    items: Object.freeze([
      Object.freeze({
        name: "My statistics",
        href: ROUTES.AGENT_STATISTICS,
        icon: StatisticsIcon,
        agentOnly: true,
      }),
      Object.freeze({
        name: "Links",
        href: ROUTES.LINKS,
        icon: LinksIcon,
        moduleKey: "links",
      }),
      Object.freeze({
        name: "Settings",
        href: "/dashboard/settings",
        icon: SettingsIcon,
      }),
      Object.freeze({
        name: "Archive",
        href: ROUTES.ARCHIVE,
        icon: ArchiveIcon,
      }),
    ]),
  }),
]) as ReadonlyArray<NavSection>;

export interface NavCounts {
  tickets?: number;
  todos?: number;
}

interface DashboardSidebarProps {
  enabledModuleKeys: string[];
  userRole?: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
  navCounts?: NavCounts;
}

export const DashboardSidebar = ({
  enabledModuleKeys,
  userRole,
  navCounts,
}: DashboardSidebarProps) => {
  const pathname = useLocation().pathname;
  const { isMobileOpen, setIsMobileOpen, toolbarCompact } = useSidebar();

  const enabledModulesSet = new Set(enabledModuleKeys);

  const filterItem = (item: NavItem) => {
    if (item.agentOnly && userRole !== "AGENT") {
      return false;
    }
    if (item.moduleKey) {
      return enabledModulesSet.has(item.moduleKey);
    }
    return true;
  };

  const filteredStandalone = STANDALONE_NAV_ITEMS.filter(filterItem);
  const filteredSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(filterItem),
  })).filter((section) => section.items.length > 0);

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
            <svg
              className="w-6 h-6 text-neutral-700 dark:text-neutral-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        <div className="flex flex-col h-full">
          <div
            className={cn(
              "flex items-center border-b border-white/15 px-6 transition-[height,padding] duration-300 ease-out dark:border-white/10",
              toolbarCompact ? "h-12 px-5" : "h-16 px-6",
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
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-r border-white/20 dark:border-white/10">
          <nav className="flex-1 space-y-4 overflow-y-auto px-4 py-6 scrollbar-sidebar">
            {filteredStandalone.map((item) => {
              const isActive =
                item.href === ROUTES.DASHBOARD
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const IconComponent = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
                  )}
                >
                  <span
                    className={cn(
                      isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400"
                    )}
                  >
                    <IconComponent />
                  </span>
                  {item.name}
                </Link>
              );
            })}

            {filteredSections.map((section, sectionIndex) => {
              const SectionIcon = section.icon;
              const hasActiveItem = section.items.some((item) => {
                return pathname === item.href || pathname.startsWith(item.href + "/");
              });

              return (
                <CollapsibleNavSection
                  key={`section-${sectionIndex}-${section.title}`}
                  title={section.title}
                  icon={<SectionIcon />}
                  defaultExpanded={section.title === "Work" || hasActiveItem}
                >
                  {section.items.map((item, itemIndex) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    const IconComponent = item.icon;
                    const count = item.countKey ? (navCounts?.[item.countKey] ?? 0) : 0;
                    return (
                      <Link
                        key={`nav-${sectionIndex}-${itemIndex}-${item.name}`}
                        to={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                            : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
                        )}
                      >
                        <span
                          className={cn(
                            isActive
                              ? "text-primary-600 dark:text-primary-400"
                              : "text-neutral-500 dark:text-neutral-400"
                          )}
                        >
                          <IconComponent />
                        </span>
                        <span className="flex-1 truncate">{item.name}</span>
                        {count > 0 && (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold",
                              isActive
                                ? "bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200"
                                : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                            )}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </CollapsibleNavSection>
              );
            })}
          </nav>

          <div className="border-t border-neutral-200 px-4 py-4 dark:border-neutral-800">
            <Link
              to={ROUTES.HOME}
              className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Home
            </Link>
          </div>
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <div
          role="presentation"
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
};
