"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getUserTheme, updateUserTheme } from "@/server/actions/theme";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * ThemeProvider - Manages theme state and applies dark mode classes
 * Supports light, dark, and system (follows OS preference) themes
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Helper function to get system theme - consistent across all uses
  const getSystemTheme = React.useCallback((): "light" | "dark" => {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }, []);

  // Helper function to resolve theme to light or dark
  const resolveTheme = React.useCallback((themeValue: Theme): "light" | "dark" => {
    if (themeValue === "system") {
      return getSystemTheme();
    }
    return themeValue;
  }, [getSystemTheme]);

  // Initialize theme with safe default (no localStorage access during SSR)
  // The blocking script in layout.tsx already sets the dark class based on localStorage
  const [theme, setThemeState] = useState<Theme>("system");

  // Initialize effectiveTheme with safe default to avoid hydration mismatch
  // Will be updated after mount when we can safely access DOM
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");

  const [mounted, setMounted] = useState(false);

  // Load theme from database and localStorage after mount to prevent hydration mismatch
  useEffect(() => {
    // Mark as mounted
    setMounted(true);

    // Load theme priority: database (if authenticated) > localStorage > system
    const loadTheme = async () => {
      try {
        // First, try to get theme from database (for authenticated users)
        const dbTheme = await getUserTheme();
        
        if (dbTheme && dbTheme !== "system") {
          // User has a theme preference in database, use it
          setThemeState(dbTheme);
          const resolved = dbTheme === "system" ? getSystemTheme() : dbTheme;
          setEffectiveTheme(resolved);
          
          // Sync localStorage with database value
          if (typeof window !== "undefined") {
            localStorage.setItem("theme", dbTheme);
          }
          return;
        }
        
        // Fallback to localStorage if no database theme or theme is "system"
        const storedTheme = localStorage.getItem("theme") as Theme | null;
        if (storedTheme && ["light", "dark", "system"].includes(storedTheme)) {
          setThemeState(storedTheme);
          const resolved = storedTheme === "system" ? getSystemTheme() : storedTheme;
          setEffectiveTheme(resolved);
          
          // If we have a stored theme but database has "system", update database
          if (storedTheme !== "system" && dbTheme === "system") {
            updateUserTheme(storedTheme).catch((err) => {
              console.error("Failed to sync theme to database:", err);
            });
          }
        } else {
          // No stored theme, check DOM first (set by blocking script), then use system preference
          let resolved: "light" | "dark";
          try {
            resolved = document.documentElement.classList.contains("dark") ? "dark" : getSystemTheme();
          } catch {
            resolved = getSystemTheme();
          }
          setEffectiveTheme(resolved);
        }
      } catch (error) {
        // If database fetch fails, fall back to localStorage
        console.error("Error loading theme from database:", error);
        try {
          const storedTheme = localStorage.getItem("theme") as Theme | null;
          if (storedTheme && ["light", "dark", "system"].includes(storedTheme)) {
            setThemeState(storedTheme);
            const resolved = storedTheme === "system" ? getSystemTheme() : storedTheme;
            setEffectiveTheme(resolved);
          } else {
            let resolved: "light" | "dark";
            try {
              resolved = document.documentElement.classList.contains("dark") ? "dark" : getSystemTheme();
            } catch {
              resolved = getSystemTheme();
            }
            setEffectiveTheme(resolved);
          }
        } catch {
          // localStorage not available, check DOM first, then use system preference
          let resolved: "light" | "dark";
          try {
            resolved = document.documentElement.classList.contains("dark") ? "dark" : getSystemTheme();
          } catch {
            resolved = getSystemTheme();
          }
          setEffectiveTheme(resolved);
        }
      }
    };

    loadTheme();
  }, [getSystemTheme]);

  // Determine effective theme (resolves "system" to light or dark)
  useEffect(() => {
    if (!mounted) return;

    const resolved = resolveTheme(theme);
    
    // Always verify and apply theme class, even if state matches
    // This ensures consistency if DOM was modified externally
    const root = document.documentElement;
    const hasDarkClass = root.classList.contains("dark");
    const shouldBeDark = resolved === "dark";
    
    // Sync DOM with resolved theme
    if (shouldBeDark && !hasDarkClass) {
      root.classList.add("dark");
    } else if (!shouldBeDark && hasDarkClass) {
      root.classList.remove("dark");
    }
    
    // Update effective theme state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEffectiveTheme((prev) => {
      if (prev === resolved) return prev;
      return resolved;
    });
  }, [theme, mounted, resolveTheme]);

  // Listen to system theme changes when theme is "system"
  useEffect(() => {
    if (!mounted || theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;

    let mediaQuery: MediaQueryList;
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }

    const handleChange = () => {
      const resolved = mediaQuery.matches ? "dark" : "light";
      const root = document.documentElement;
      const hasDarkClass = root.classList.contains("dark");
      
      // Sync DOM with system preference
      if (resolved === "dark" && !hasDarkClass) {
        root.classList.add("dark");
      } else if (resolved === "light" && hasDarkClass) {
        root.classList.remove("dark");
      }
      
      // Update effective theme state based on system preference
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEffectiveTheme((prev) => {
        if (prev === resolved) return prev;
        return resolved;
      });
    };

    // Set up listener
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    
    // Update localStorage immediately for instant UI update
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", newTheme);
    }
    
    // Save to database in the background (for authenticated users)
    // This ensures theme syncs across all devices
    updateUserTheme(newTheme).catch((err) => {
      console.error("Failed to save theme to database:", err);
      // Theme is still saved in localStorage, so it works locally
    });
  };

  // Always provide the context, even before mounted (prevents hydration errors)
  // The theme will be updated once mounted and localStorage is read
  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * Returns default values if ThemeProvider is not available (for SSR safety)
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Return default values instead of throwing to handle SSR edge cases
    // This should not happen in normal usage as ThemeProvider is in root layout
    console.warn("useTheme called outside ThemeProvider, using default values");
    return {
      theme: "system" as Theme,
      effectiveTheme: "light" as "light" | "dark",
      setTheme: () => {
        console.warn("setTheme called but ThemeProvider is not available");
      },
    };
  }
  return context;
}

