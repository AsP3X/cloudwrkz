import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { APP_CONFIG } from "@/lib/constants/config";
import { CookiesDisclaimer } from "@/components/ui/CookiesDisclaimer";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ServerUnavailableProvider } from "@/components/providers/ServerUnavailableProvider";
import { KeepAliveProvider } from "@/components/providers/KeepAliveProvider";
import { getUserTheme } from "@/server/actions/theme";
import { isDatabaseAccessible } from "@/lib/utils/db-health";
import { DatabaseConnectionError } from "@/lib/utils/auth-server";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: APP_CONFIG.name,
  description: APP_CONFIG.description,
  icons: {
    icon: '/favicon.ico',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check database health
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  // Fetch theme from database (for authenticated users)
  // This ensures theme is applied immediately on first load, even on new devices
  let serverTheme: "light" | "dark" | "system" = "system";
  if (databaseAvailable) {
    try {
      serverTheme = await getUserTheme();
    } catch (error) {
      // If fetching fails, fall back to "system"
      // Check if it's a database connection error
      if (error instanceof DatabaseConnectionError) {
        databaseAvailable = false;
      }
      console.error("Error fetching theme in layout:", error);
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen`}>
        {/* Catch server disconnect / unexpected response before Next.js logs to console */}
        <Script
          id="server-disconnect-handler"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isServerDisconnect(e) {
                  if (!e) return false;
                  var msg = (e && typeof e.message === 'string') ? e.message : '';
                  var cause = e.cause;
                  if (msg.indexOf('unexpected response') !== -1 || msg.indexOf('An unexpected response was received from the server') !== -1) return true;
                  if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('Load failed') !== -1 || msg.indexOf('NetworkError') !== -1) return true;
                  if (msg.indexOf('connection refused') !== -1 || msg.indexOf('ERR_CONNECTION') !== -1 || msg.indexOf('Network request failed') !== -1) return true;
                  if (msg.indexOf('502') !== -1 || msg.indexOf('Bad Gateway') !== -1) return true;
                  if (e.status === 502 || e.statusCode === 502) return true;
                  if (cause && isServerDisconnect(cause)) return true;
                  return false;
                }
                // Next.js logs this error in fetchServerAction before rejecting; suppress that single message
                var origError = console.error;
                console.error = function() {
                  var first = arguments[0];
                  if (typeof first === 'string' && (first.indexOf('unexpected response') !== -1 || first.indexOf('An unexpected response was received from the server') !== -1 || first.indexOf('502') !== -1 || first.indexOf('Bad Gateway') !== -1)) return;
                  if (first && typeof first === 'object' && first.message && typeof first.message === 'string' && (first.message.indexOf('unexpected response') !== -1 || first.message.indexOf('An unexpected response was received from the server') !== -1 || first.message.indexOf('502') !== -1 || first.message.indexOf('Bad Gateway') !== -1)) return;
                  return origError.apply(console, arguments);
                };
                window.addEventListener('unhandledrejection', function(event) {
                  if (isServerDisconnect(event.reason)) {
                    event.preventDefault();
                    try { window.__serverUnavailableReason = event.reason; window.dispatchEvent(new CustomEvent('serverunavailable', { detail: event.reason })); } catch (_) {}
                  }
                }, true);
              })();
            `,
          }}
        />
        {/* Blocking script to prevent white flash - must run before React hydrates */}
        {/* Priority: serverTheme (from database) > localStorage > system */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Fix Performance API measure errors (Next.js internal tracking)
                  if (typeof window !== 'undefined' && window.performance && window.performance.measure) {
                    const originalMeasure = window.performance.measure.bind(window.performance);
                    window.performance.measure = function(name, startMark, endMark) {
                      try {
                        // Check if marks exist before measuring
                        if (startMark && typeof startMark === 'string') {
                          const startEntries = performance.getEntriesByName(startMark, 'mark');
                          if (startEntries.length === 0) {
                            return; // Mark doesn't exist, skip measurement
                          }
                        }
                        if (endMark && typeof endMark === 'string') {
                          const endEntries = performance.getEntriesByName(endMark, 'mark');
                          if (endEntries.length === 0) {
                            return; // Mark doesn't exist, skip measurement
                          }
                        }
                        // Try to measure, but catch any errors
                        return originalMeasure(name, startMark, endMark);
                      } catch (e) {
                        // Silently ignore performance measurement errors
                        // This prevents "cannot have a negative time stamp" errors from Next.js
                        // Common causes: marks cleared before measurement, timing issues, or invalid mark names
                        return;
                      }
                    };
                  }
                  
                  // Get theme from server (database) or localStorage
                  const serverTheme = ${JSON.stringify(serverTheme)};
                  const storedTheme = localStorage.getItem('theme');
                  
                  // Priority: serverTheme > localStorage > system
                  const theme = (serverTheme && serverTheme !== 'system' && ['light', 'dark', 'system'].includes(serverTheme))
                    ? serverTheme
                    : (storedTheme && ['light', 'dark', 'system'].includes(storedTheme))
                    ? storedTheme
                    : 'system';
                  
                  // Sync localStorage with server theme if different
                  if (serverTheme && serverTheme !== 'system' && storedTheme !== serverTheme) {
                    localStorage.setItem('theme', serverTheme);
                  }
                  
                  const getSystemTheme = () => {
                    if (typeof window === 'undefined' || !window.matchMedia) return 'light';
                    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  };
                  
                  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
                  
                  const root = document.documentElement;
                  if (resolvedTheme === 'dark') {
                    root.classList.add('dark');
                  } else {
                    root.classList.remove('dark');
                  }
                } catch (e) {
                  // Ignore errors in case localStorage is not available
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
        <ThemeProvider>
          <KeepAliveProvider>
            <ServerUnavailableProvider>
              {children}
              <CookiesDisclaimer />
            </ServerUnavailableProvider>
          </KeepAliveProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
