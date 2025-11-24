"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export const Header = () => {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shadow-soft"
          : "bg-transparent"
      )}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link
            href={ROUTES.HOME}
            className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
          >
            {APP_CONFIG.name}
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#features"
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
            >
              Features
            </a>
            <Link
              href={ROUTES.ABOUT}
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
            >
              About
            </Link>
            <Link
              href={ROUTES.CONTACT}
              className="text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors duration-200"
            >
              Contact
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              asChild
              href={ROUTES.LOGIN}
            >
              Sign In
            </Button>
            <Button variant="primary" size="sm" asChild href={ROUTES.REGISTER}>
              Get Started
            </Button>
          </div>
        </div>
      </nav>
    </header>
  );
};
