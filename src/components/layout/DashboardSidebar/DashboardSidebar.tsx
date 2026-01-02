"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { useSidebar } from "../SidebarContext";
import { CollapsibleNavSection } from "@/components/ui/CollapsibleNavSection";

// Icon components - simple functions to avoid hydration issues
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

// Navigation item type
type NavItem = {
  readonly name: string;
  readonly href: string;
  readonly icon: () => JSX.Element;
  readonly moduleKey?: string;
  readonly agentOnly?: boolean;
};

// Standalone items (top-level, non-collapsible)
const STANDALONE_NAV_ITEMS = Object.freeze([
  Object.freeze({
    name: "Dashboard",
    href: ROUTES.DASHBOARD,
    icon: DashboardIcon,
  }),
]) as ReadonlyArray<NavItem>;

// Grouped sections similar to Admin sidebar
type NavSection = {
  readonly title: string;
  readonly icon: () => JSX.Element;
  readonly items: ReadonlyArray<NavItem>;
  readonly defaultExpanded?: boolean;
};

const NAV_SECTIONS = Object.freeze([
  Object.freeze({
    title: "Work",
    icon: TicketsIcon,
    defaultExpanded: true,
    items: Object.freeze([
      Object.freeze({
        name: "Tickets",
        href: "/dashboard/tickets",
        icon: TicketsIcon,
        moduleKey: "tickets",
      }),
      Object.freeze({
        name: "ToDo",
        href: "/dashboard/todos",
        icon: TodosIcon,
        moduleKey: "todos",
      }),
    ]),
  }),
  Object.freeze({
    title: "Time tracking",
    icon: TimeTrackingIcon,
    defaultExpanded: true,
    items: Object.freeze([
      Object.freeze({
        name: "My time",
        href: "/dashboard/time-tracking",
        icon: TimeTrackingIcon,
        moduleKey: "timetracking",
      }),
    ]),
  }),
  Object.freeze({
    title: "Personal",
    icon: SettingsIcon,
    defaultExpanded: true,
    items: Object.freeze([
      Object.freeze({
        name: "My statistics",
        href: ROUTES.AGENT_STATISTICS,
        icon: StatisticsIcon,
        // Only for agents; hidden for others
        agentOnly: true,
      }),
      Object.freeze({
        name: "Settings",
        href: "/dashboard/settings",
        icon: SettingsIcon,
      }),
    ]),
  }),
]) as ReadonlyArray<NavSection>;

interface DashboardSidebarProps {
  enabledModuleKeys: string[];
  userRole?: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
}

export const DashboardSidebar = ({ enabledModuleKeys, userRole }: DashboardSidebarProps) => {
  const pathname = usePathname();
  const { isMobileOpen, setIsMobileOpen } = useSidebar();

  // Filter helper based on modules and role
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
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile close button - sticky on right side outside sidebar */}
        {isMobileOpen && (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden fixed top-4 z-50 p-2 rounded-lg bg-white dark:bg-neutral-900 shadow-lg border border-neutral-200 dark:border-neutral-800"
            aria-label="Close sidebar"
            style={{ left: 'calc(16rem + 1rem)' }}
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
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-neutral-200 dark:border-neutral-800">
            <Link
              href={ROUTES.DASHBOARD}
              className="text-xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent"
            >
              {APP_CONFIG.name}
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
            {/* Standalone items */}
            {filteredStandalone.map((item, index) => {
              const isActive =
                item.href === ROUTES.DASHBOARD
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              const IconComponent = item.icon;
              return (
                <Link
                  key={`nav-standalone-${index}-${item.name}`}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
                  )}
                >
                  <span className={cn(isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400")}>
                    <IconComponent />
                  </span>
                  {item.name}
                </Link>
              );
            })}

            {/* Collapsible sections */}
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
                  defaultExpanded={section.defaultExpanded ?? hasActiveItem}
                >
                  {section.items.map((item, itemIndex) => {
                    const isActive =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    const IconComponent = item.icon;
                    return (
                      <Link
                        key={`nav-${sectionIndex}-${itemIndex}-${item.name}`}
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800"
                            : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-primary-600 dark:hover:text-primary-400"
                        )}
                      >
                        <span className={cn(isActive ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-400")}>
                          <IconComponent />
                        </span>
                        {item.name}
                      </Link>
                    );
                  })}
                </CollapsibleNavSection>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-neutral-200 dark:border-neutral-800">
            <Link
              href={ROUTES.HOME}
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
      </aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
};
