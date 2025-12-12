import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/lib/constants/config";
import { CookiesDisclaimer } from "@/components/ui/CookiesDisclaimer";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { getUserTheme } from "@/server/actions/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  // Fetch theme from database (for authenticated users)
  // This ensures theme is applied immediately on first load, even on new devices
  let serverTheme: "light" | "dark" | "system" = "system";
  try {
    serverTheme = await getUserTheme();
  } catch (error) {
    // If fetching fails, fall back to "system"
    console.error("Error fetching theme in layout:", error);
  }

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Blocking script to prevent white flash - must run before React hydrates */}
        {/* Priority: serverTheme (from database) > localStorage > system */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
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
          {children}
          <CookiesDisclaimer />
        </ThemeProvider>
      </body>
    </html>
  );
}
