import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { log } from "@/lib/logger";
import { useSidebar } from "./SidebarContext";
import { getAvatarUrl } from "@/lib/utils/users";
import type { User } from "@/components/providers/AuthProvider";

interface DashboardHeaderProps {
  user: User;
}

export const DashboardHeader = ({ user }: DashboardHeaderProps) => {
  const { logout } = useAuth();
  const pathname = useLocation().pathname;
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const { isMobileOpen, setIsMobileOpen } = useSidebar();
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
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-200/50 dark:border-neutral-800/50 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2 lg:flex-none">
            {!isMobileOpen && (
              <button
                onClick={() => setIsMobileOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Open sidebar"
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
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-4 flex-1 lg:flex-initial justify-end min-w-0">
            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-primary-100 dark:bg-primary-900 flex-shrink-0">
                  {(() => {
                    const avatarUrl = getAvatarUrl(user.avatar);
                    return avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={user.name || user.email}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                        {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                      </span>
                    );
                  })()}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {user.name || user.email.split("@")[0]}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 capitalize">
                    {user.role.toLowerCase()}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 text-neutral-500 dark:text-neutral-400"
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
                    className="fixed w-56 bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 py-2 z-[100]"
                    style={{
                      top: `${menuPosition.top}px`,
                      right: `${menuPosition.right}px`,
                    }}
                  >
                    <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
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
                    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-2">
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
