"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

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

  // Initialize effectiveTheme by checking DOM (set by blocking script)
  // This is safe because the blocking script runs before React hydrates
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    // Check if dark class is already on the document (from blocking script)
    // This is safe because blocking script runs synchronously before React
    try {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage after mount to prevent hydration mismatch
  useEffect(() => {
    // Mark as mounted
    setMounted(true);

    // Load theme from localStorage now that we're on the client
    try {
      const storedTheme = localStorage.getItem("theme") as Theme | null;
      if (storedTheme && ["light", "dark", "system"].includes(storedTheme)) {
        setThemeState(storedTheme);
        // Update effectiveTheme based on stored theme
        const resolved = storedTheme === "system" ? getSystemTheme() : storedTheme;
        setEffectiveTheme(resolved);
      } else {
        // No stored theme, use system preference
        const resolved = getSystemTheme();
        setEffectiveTheme(resolved);
      }
    } catch {
      // localStorage not available, use system preference
      const resolved = getSystemTheme();
      setEffectiveTheme(resolved);
    }
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
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", newTheme);
    }
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

