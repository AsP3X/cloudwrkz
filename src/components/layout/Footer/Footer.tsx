"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "loading";

export const Footer = () => {
  // Use state to ensure year is only set on client to avoid hydration mismatches
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("loading");

  useEffect(() => {
    setMounted(true);
    setCurrentYear(new Date().getFullYear());

    // Fetch health status
    const fetchHealthStatus = async () => {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        setHealthStatus(data.status || "unhealthy");
      } catch (error) {
        console.error("Error fetching health status:", error);
        setHealthStatus("unhealthy");
      }
    };

    fetchHealthStatus();

    // Refresh health status every 30 seconds
    const interval = setInterval(fetchHealthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const footerLinks = {
    Product: [
      { label: "Features", href: "#features" },
    ],
    Company: [
      { label: "About", href: ROUTES.ABOUT },
      { label: "Contact", href: ROUTES.CONTACT },
    ],
    Legal: [
      { label: "Privacy", href: ROUTES.PRIVACY },
      { label: "Terms", href: ROUTES.TERMS },
    ],
  };

  return (
    <footer className="bg-neutral-900 dark:bg-neutral-950 text-neutral-300 dark:text-neutral-400">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link
              href={ROUTES.HOME}
              className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 dark:from-primary-300 dark:to-secondary-300 bg-clip-text text-transparent mb-4 inline-block"
            >
              {APP_CONFIG.name}
            </Link>
            <p className="text-neutral-400 dark:text-neutral-500 mb-4 max-w-md">
              Building modern applications with cutting-edge technology.
              Enterprise-ready, developer-friendly.
            </p>
            {/* Social media links - Remove or update with actual URLs when available */}
            {/* <div className="flex space-x-4">
              <a
                href="https://twitter.com/yourhandle"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-neutral-800 dark:bg-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a
                href="https://github.com/yourhandle"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-neutral-800 dark:bg-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a
                href="https://linkedin.com/company/yourhandle"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-neutral-800 dark:bg-neutral-900 flex items-center justify-center hover:bg-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
            </div> */}
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-white dark:text-neutral-200 font-semibold mb-4">{category}</h3>
              <ul className="space-y-2" role="list">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("#") ? (
                      <a
                        href={link.href}
                        className="text-neutral-400 dark:text-neutral-500 hover:text-white dark:hover:text-neutral-300 transition-colors"
                        aria-label={link.label}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-neutral-400 dark:text-neutral-500 hover:text-white dark:hover:text-neutral-300 transition-colors"
                        aria-label={link.label}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* System Section with Health Status Button */}
          <div>
            <h3 className="text-white dark:text-neutral-200 font-semibold mb-4">System</h3>
            <Link
              href={ROUTES.HEALTH}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 dark:bg-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-800 rounded-lg transition-colors text-neutral-300 dark:text-neutral-400 hover:text-white dark:hover:text-neutral-300"
              aria-label="Health Status"
            >
              <span className="relative flex h-2 w-2">
                {healthStatus === "healthy" && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </>
                )}
                {healthStatus === "degraded" && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                  </>
                )}
                {(healthStatus === "unhealthy" || healthStatus === "loading") && (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                )}
              </span>
              <span>Health Status</span>
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-neutral-800 dark:border-neutral-900 pt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className={cn("text-neutral-400 dark:text-neutral-500 text-sm transition-opacity duration-300", mounted ? "opacity-100" : "opacity-0")}>
            © {currentYear ?? new Date().getFullYear()} {APP_CONFIG.name}. All rights reserved.
          </p>
          <p className="text-neutral-400 dark:text-neutral-500 text-sm mt-4 sm:mt-0">
            Built with ❤️ using Next.js 15
          </p>
        </div>
      </div>
    </footer>
  );
};
