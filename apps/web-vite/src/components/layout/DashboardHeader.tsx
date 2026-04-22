// Human: Top bar for dashboard routes: global search, notifications, mobile sidebar toggle, and an account menu positioned from the avatar button’s viewport rect.
// Agent: READS useAuth logout; CALLS logout; STATE isMenuOpen, menuPosition from getBoundingClientRect; CLOSES menu on route change.
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { log } from "@/lib/logger";
import { useSidebar } from "./SidebarContext";
import { getAvatarUrl } from "@/lib/utils/users";
import { GlobalSearch } from "@/components/features/search/GlobalSearch";
import { NotificationBell } from "@/components/features/notifications/NotificationBell";
import type { User } from "@/lib/auth/types";
import { cn } from "@/lib/utils/cn";

interface DashboardHeaderProps {
  user: User;
}

export const DashboardHeader = ({ user }: DashboardHeaderProps) => {
  const { logout } = useAuth();
  const pathname = useLocation().pathname;
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const { isMobileOpen, setIsMobileOpen, toolbarCompact: headerCompact } = useSidebar();
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; right: number } | null>(
    null
  );

  React.useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      log.error("Logout error", error);
      setIsLoggingOut(false);
    }
  };

  React.useEffect(() => {
    if (isMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    } else {
      setMenuPosition(null);
    }
  }, [isMenuOpen, headerCompact]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/20 bg-white/75 shadow-sm backdrop-blur-md transition-[box-shadow] duration-300 ease-out dark:border-white/10 dark:bg-neutral-950/75">
      <div
        className={cn(
          "transition-[padding] duration-300 ease-out",
          headerCompact ? "px-3 sm:px-4 lg:px-6" : "px-4 sm:px-6 lg:px-8",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between transition-[height,gap] duration-300 ease-out",
            headerCompact ? "h-12 gap-2.5" : "h-16 gap-4",
          )}
        >
          <div className="flex items-center gap-2 lg:flex-none">
            {!isMobileOpen && (
              <button
                onClick={() => setIsMobileOpen(true)}
                className={cn(
                  "rounded-lg transition-all duration-300 ease-out lg:hidden",
                  headerCompact ? "p-1.5" : "p-2",
                  "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                )}
                aria-label="Open sidebar"
              >
                <svg
                  className={cn(
                    "text-neutral-700 transition-[width,height] duration-300 ease-out dark:text-neutral-300",
                    headerCompact ? "h-[1.125rem] w-[1.125rem]" : "h-6 w-6",
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            )}
          </div>

          <div
            className={cn(
              "flex min-w-0 flex-1 items-center justify-end transition-[gap] duration-300 ease-out lg:flex-initial",
              headerCompact ? "gap-2 sm:gap-3" : "gap-1 sm:gap-4",
            )}
          >
            <GlobalSearch compact={headerCompact} />
            <NotificationBell compact={headerCompact} />

            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={cn(
                  "flex items-center rounded-lg transition-all duration-300 ease-out",
                  headerCompact ? "gap-2 px-2.5 py-1" : "gap-3 px-3 py-2",
                  "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                )}
              >
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 transition-[width,height] duration-300 ease-out dark:bg-primary-900",
                    headerCompact ? "h-7 w-7" : "h-8 w-8",
                  )}
                >
                  {(() => {
                    const avatarUrl = getAvatarUrl(user.avatar);
                    return avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={user.name || user.email}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span
                        className={cn(
                          "font-semibold text-primary-700 transition-[font-size] duration-300 ease-out dark:text-primary-300",
                          headerCompact ? "text-[0.8125rem]" : "text-sm",
                        )}
                      >
                        {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                      </span>
                    );
                  })()}
                </div>
                {headerCompact ? (
                  <div className="hidden min-w-0 max-w-[7.5rem] text-left sm:block md:max-w-[11rem]">
                    <p className="truncate text-xs font-medium leading-tight text-neutral-900 dark:text-neutral-100">
                      {user.name || user.email.split("@")[0]}
                    </p>
                  </div>
                ) : (
                  <div className="hidden text-left sm:block">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {user.name || user.email.split("@")[0]}
                    </p>
                    <p className="text-xs capitalize text-neutral-500 dark:text-neutral-400">
                      {user.role.toLowerCase()}
                    </p>
                  </div>
                )}
                <svg
                  className={cn(
                    "text-neutral-500 transition-[width,height] duration-300 ease-out dark:text-neutral-400",
                    headerCompact ? "h-3.5 w-3.5" : "h-4 w-4",
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {isMenuOpen && menuPosition && (
                <>
                  <div
                    role="presentation"
                    className="fixed inset-0 z-[45]"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <div
                    className="fixed z-[100] w-56 rounded-xl border border-white/20 bg-white/92 py-2 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/90"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                    }}
                  >
                    <div className="flex items-center gap-3 border-b border-white/15 px-4 py-3 dark:border-white/10">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900 flex-shrink-0 flex items-center justify-center">
                        {(() => {
                          const avatarUrl = getAvatarUrl(user.avatar);
                          return avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                              {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {user.name || "User"}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="py-2">
                      <Link
                        to="/dashboard/profile"
                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        View Profile
                      </Link>
                      <Link
                        to="/dashboard/settings"
                        className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Settings
                      </Link>
                    </div>
                    <div className="border-t border-white/15 pt-2 dark:border-white/10">
                      <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="w-full px-4 py-2 text-sm text-left text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950 transition-colors disabled:opacity-50"
                      >
                        {isLoggingOut ? "Logging out..." : "Sign out"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
