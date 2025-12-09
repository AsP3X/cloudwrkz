"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export const Header = () => {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

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

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shadow-soft"
          : "bg-transparent"
      )}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex h-16 items-center justify-between">
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
            className="md:hidden p-2 rounded-md text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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

        {/* Mobile Menu */}
        <div
          id="mobile-menu"
          className={cn(
            "md:hidden fixed inset-x-0 top-16 bottom-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 transition-transform duration-300 ease-in-out overflow-y-auto",
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          )}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="container mx-auto px-4 py-6 space-y-4">
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
      </nav>
    </header>
  );
};
