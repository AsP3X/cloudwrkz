import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const getSystemTheme = useCallback((): "light" | "dark" => {
    if (!window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);

  const resolveTheme = useCallback(
    (themeValue: Theme): "light" | "dark" => {
      return themeValue === "system" ? getSystemTheme() : themeValue;
    },
    [getSystemTheme],
  );

  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("theme") as Theme | null;
      if (stored && ["light", "dark", "system"].includes(stored)) return stored;
    } catch {
      // localStorage unavailable
    }
    return "system";
  });

  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(() => {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  useEffect(() => {
    const resolved = resolveTheme(theme);
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    setEffectiveTheme(resolved);
  }, [theme, resolveTheme]);

  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const resolved = mediaQuery.matches ? "dark" : "light";
      const root = document.documentElement;
      if (resolved === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
      setEffectiveTheme(resolved);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // localStorage unavailable
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      theme: "system" as Theme,
      effectiveTheme: "light" as "light" | "dark",
      setTheme: () => {},
    };
  }
  return context;
}
