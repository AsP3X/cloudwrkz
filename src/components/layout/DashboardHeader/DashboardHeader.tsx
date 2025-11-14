"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/server/actions/logout";
import { ROUTES } from "@/lib/constants/routes";
import type { CurrentUser } from "@/lib/utils/auth-server";

interface DashboardHeaderProps {
  user: CurrentUser;
}

export const DashboardHeader = ({ user }: DashboardHeaderProps) => {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const result = await logout();
      if (result.success) {
        router.push(ROUTES.LOGIN);
        router.refresh();
      } else {
        console.error("Logout failed:", result.error);
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left side - can add breadcrumbs or page title here */}
          <div className="flex-1"></div>

          {/* Right side - User menu */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold text-primary-700">
                  {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-neutral-900">
                  {user.name || user.email.split("@")[0]}
                </p>
                <p className="text-xs text-neutral-500 capitalize">{user.role.toLowerCase()}</p>
              </div>
              <svg
                className="w-4 h-4 text-neutral-500"
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

            {/* Dropdown menu */}
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-neutral-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-neutral-200">
                    <p className="text-sm font-medium text-neutral-900">{user.name || "User"}</p>
                    <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                  </div>
                  <div className="py-2">
                    <a
                      href="/dashboard/profile"
                      className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      View Profile
                    </a>
                    <a
                      href="/dashboard/settings"
                      className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Settings
                    </a>
                  </div>
                  <div className="border-t border-neutral-200 pt-2">
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full px-4 py-2 text-sm text-left text-error-600 hover:bg-error-50 transition-colors disabled:opacity-50"
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
    </header>
  );
};
