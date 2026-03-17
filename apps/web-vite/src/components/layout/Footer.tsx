import { useState } from "react";
import { Link } from "react-router-dom";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export const Footer = () => {
  const [currentYear] = useState<number>(() => new Date().getFullYear());

  const footerLinks = {
    Product: [{ label: "Features", href: "#features" }],
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
              to={ROUTES.HOME}
              className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-secondary-400 dark:from-primary-300 dark:to-secondary-300 bg-clip-text text-transparent mb-4 inline-block"
            >
              {APP_CONFIG.name}
            </Link>
            <p className="text-neutral-400 dark:text-neutral-500 mb-4 max-w-md">
              Building modern applications with cutting-edge technology.
              Enterprise-ready, developer-friendly.
            </p>
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
                        to={link.href}
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

          {/* System Section with Health Status Link */}
          <div>
            <h3 className="text-white dark:text-neutral-200 font-semibold mb-4">System</h3>
            <Link
              to={ROUTES.HEALTH}
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 dark:bg-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-800 rounded-lg transition-colors text-neutral-300 dark:text-neutral-400 hover:text-white dark:hover:text-neutral-300"
              aria-label="Health Status"
            >
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-500" />
              </span>
              <span>Health Status</span>
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-neutral-800 dark:border-neutral-900 pt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-neutral-400 dark:text-neutral-500 text-sm">
            © {currentYear} {APP_CONFIG.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
