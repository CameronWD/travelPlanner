"use client";

import * as React from "react";

/** Tailwind's `lg` breakpoint (64rem): the desktop layout from here up. */
export const LG_UP = "(min-width: 1024px)";

const getServerSnapshot = () => null;

/**
 * Live `matchMedia(query).matches` on `useSyncExternalStore` (the pattern
 * `components/ui/dialog.tsx:19` uses). `null` in the server render and during
 * hydration — there is no viewport there — so a caller can keep the
 * server's markup until the first client render, then switch to one tree.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = React.useCallback(
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false),
    [query],
  );
  return React.useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot);
}
