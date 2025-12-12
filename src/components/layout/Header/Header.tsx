"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { DatabaseWarning } from "@/components/ui/DatabaseWarning";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";

interface HeaderProps {
  databaseAvailable?: boolean;
}

export const Header = ({ databaseAvailable: initialDatabaseAvailable = true }: HeaderProps) => {
  // Use client-side health monitoring to detect database status changes
  const { status } = useDatabaseHealth({
    pollInterval: 30000, // Check every 30 seconds
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
  });

  // Determine if database is available based on health status
  const databaseAvailable = status === "healthy" || status === "degraded";

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // This ensures hooks are called in the same order on every render
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  // Initialize with safe default to avoid hydration mismatch
  // Will be updated after mount when we can safely access DOM
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    // Check for dark mode - only after mount to avoid hydration issues
    const checkDarkMode = () => {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    checkDarkMode();
    // Watch for dark mode changes
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const observer = new MutationObserver(checkDarkMode);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    }
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    // Close mobile menu on escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileMenuOpen]);

  React.useEffect(() => {
    // Prevent body scroll when mobile menu is open
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // If database is unavailable, show the warning banner instead of navigation
  // This conditional return is now AFTER all hooks have been called
  if (!databaseAvailable) {
    return (
      <header className="fixed top-0 left-0 right-0 z-[100]">
        <DatabaseWarning />
      </header>
    );
  }

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] transition-all duration-300",
        scrolled
          ? "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shadow-soft"
          : "bg-transparent"
      )}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-[101]" aria-label="Main navigation">
        <div className="flex h-16 items-center justify-between relative">
          <Link
            href={ROUTES.HOME}
            className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
            aria-label={`${APP_CONFIG.name} - Home`}
          >
            {APP_CONFIG.name}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#features"
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
              aria-label="View features section"
            >
              Features
            </a>
            <Link
              href={ROUTES.ABOUT}
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
              aria-label="Learn more about us"
            >
              About
            </Link>
            <Link
              href={ROUTES.CONTACT}
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
              aria-label="Contact us"
            >
              Contact
            </Link>
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              asChild
              href={ROUTES.LOGIN}
              aria-label="Sign in to your account"
            >
              Sign In
            </Button>
            <Button variant="primary" size="sm" asChild href={ROUTES.REGISTER} aria-label="Get started with a free account">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden relative z-[102] p-2 rounded-md text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            style={{ touchAction: 'manipulation' }}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMobileMenuOpen(!mobileMenuOpen);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
          >
            {mobileMenuOpen ? (
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Backdrop and Menu - Rendered via Portal */}
      {mounted && (
        <>
          {createPortal(
            <>
              {/* Mobile Menu Backdrop */}
              <div
                className={cn(
                  "md:hidden fixed left-0 right-0 top-16 bottom-0 bg-black/50 transition-opacity duration-300",
                  mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                style={{ 
                  visibility: mobileMenuOpen ? 'visible' : 'hidden',
                  zIndex: 999998,
                }}
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden={!mobileMenuOpen}
              />

              {/* Mobile Menu */}
              <div
                id="mobile-menu"
                className={cn(
                  "md:hidden fixed left-0 right-0 top-16 bottom-0 border-t-2 border-neutral-300 dark:border-neutral-700 shadow-2xl transition-transform duration-300 ease-in-out overflow-hidden",
                  mobileMenuOpen 
                    ? "translate-x-0" 
                    : "translate-x-full"
                )}
                style={{
                  pointerEvents: mobileMenuOpen ? 'auto' : 'none',
                  backgroundColor: isDark ? '#171717' : '#ffffff',
                  zIndex: 999999,
                }}
                aria-hidden={!mobileMenuOpen}
              >
                {/* Background layer - always solid and visible during animation */}
                <div
                  className="absolute inset-0 transition-none"
                  style={{
                    backgroundColor: isDark ? '#171717' : '#ffffff',
                    zIndex: 0,
                  }}
                />
                {/* Content */}
                <div className="relative h-full overflow-y-auto z-10">
                  <div className="container mx-auto px-4 py-6 space-y-4 min-h-full w-full">
                <a
                  href="#features"
                  className="block py-3 px-4 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                  onClick={handleNavClick}
                  aria-label="View features section"
                >
                  Features
                </a>
                <Link
                  href={ROUTES.ABOUT}
                  className="block py-3 px-4 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                  onClick={handleNavClick}
                  aria-label="Learn more about us"
                >
                  About
                </Link>
                <Link
                  href={ROUTES.CONTACT}
                  className="block py-3 px-4 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                  onClick={handleNavClick}
                  aria-label="Contact us"
                >
                  Contact
                </Link>
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                  <Button
                    variant="ghost"
                    size="md"
                    className="w-full justify-center"
                    asChild
                    href={ROUTES.LOGIN}
                    onClick={handleNavClick}
                    aria-label="Sign in to your account"
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full justify-center"
                    asChild
                    href={ROUTES.REGISTER}
                    onClick={handleNavClick}
                    aria-label="Get started with a free account"
                  >
                    Get Started
                  </Button>
                  </div>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )}
          {/* Inline styles to ensure background is always applied */}
          {mobileMenuOpen && (
            <style dangerouslySetInnerHTML={{
              __html: `
                #mobile-menu {
                  background-color: ${isDark ? '#171717' : '#ffffff'} !important;
                }
                #mobile-menu > div:first-child {
                  background-color: ${isDark ? '#171717' : '#ffffff'} !important;
                }
              `
            }} />
          )}
        </>
      )}
    </header>
  );
};
