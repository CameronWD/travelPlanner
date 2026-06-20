"use client";

import * as React from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "trip-planner-theme";

type ThemeContextValue = {
  /** The currently-applied theme. */
  theme: Theme;
  /** Set the theme explicitly and persist the choice. */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark. */
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);

/**
 * Inline script run before hydration so the correct `.dark` class is on
 * <html> before first paint — avoids a flash of the wrong theme. Reads the
 * persisted choice, falling back to the OS preference.
 */
const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function resolveTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fall through.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// --- External store: the source of truth is the DOM/localStorage, observed
// via useSyncExternalStore so we never call setState inside an effect. ---

const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function commitTheme(next: Theme) {
  applyThemeClass(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore persistence failures.
  }
  notify();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // On first client commit, reconcile the DOM to the resolved preference and
  // notify subscribers. Runs once; not a setState-in-effect (mutates the
  // external store, which is the recommended pattern for such effects).
  React.useEffect(() => {
    commitTheme(resolveTheme());
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    commitTheme(next);
  }, []);

  const toggleTheme = React.useCallback(() => {
    commitTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <script
        // Pre-hydration: set the class before paint.
        dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
