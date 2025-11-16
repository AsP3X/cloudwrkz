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

  // Initialize theme from localStorage and check what's actually in the DOM
  // This ensures we sync with the blocking script
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    try {
      const storedTheme = localStorage.getItem("theme") as Theme | null;
      return storedTheme && ["light", "dark", "system"].includes(storedTheme)
        ? storedTheme
        : "system";
    } catch {
      return "system";
    }
  });

  // Initialize effectiveTheme based on what's actually in the DOM (set by blocking script)
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    // Check if dark class is already on the document (from blocking script)
    const hasDarkClass = document.documentElement.classList.contains("dark");
    if (hasDarkClass) return "dark";
    // Otherwise, resolve the initial theme
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    const initialTheme = storedTheme && ["light", "dark", "system"].includes(storedTheme)
      ? storedTheme
      : "system";
    // Resolve inline to avoid closure issues
    if (initialTheme === "system") {
      if (typeof window !== "undefined" && window.matchMedia) {
        try {
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } catch {
          return "light";
        }
      }
      return "light";
    }
    return initialTheme;
  });

  const [mounted, setMounted] = useState(false);

  // Mark as mounted after initial render
  useEffect(() => {
    setMounted(true);
  }, []);

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
      
      // Update effective theme state
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
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

