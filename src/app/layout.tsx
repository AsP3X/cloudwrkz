import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/lib/constants/config";
import { CookiesDisclaimer } from "@/components/ui/CookiesDisclaimer";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Blocking script to prevent white flash - must run before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const storedTheme = localStorage.getItem('theme');
                  const theme = storedTheme && ['light', 'dark', 'system'].includes(storedTheme) 
                    ? storedTheme 
                    : 'system';
                  
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
