"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME_ID, THEMES, type ThemeId } from "@/themes/registry";

const STORAGE_KEY = "app-theme";

function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = THEMES.some((t) => t.id === stored);
    return valid ? (stored as ThemeId) : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function applyTheme(themeId: ThemeId) {
  document.documentElement.setAttribute("data-theme", themeId);
}

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (themeId: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    const stored = getStoredTheme();
    applyTheme(stored);
    startTransition(() => setThemeState(stored));
  }, []);

  const setTheme = useCallback((themeId: ThemeId) => {
    setThemeState(themeId);
    applyTheme(themeId);
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
