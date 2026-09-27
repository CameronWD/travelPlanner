"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

export interface PendingNavigation {
  /** The href as the control gave it (may carry ?search and #hash). */
  href: string;
  /** Its path part — what nav controls compare against to light up early. */
  pathname: string;
  startedAt: number;
}

interface NavigationPendingValue {
  pending: PendingNavigation | null;
  begin: (href: string) => void;
}

const NavigationPendingContext = React.createContext<NavigationPendingValue>({ pending: null, begin: () => {} });

/**
 * A navigation that never lands — an error boundary that kept the old URL, a
 * fetch the browser cancelled — must not pin the progress bar on forever.
 */
export const PENDING_NAVIGATION_TIMEOUT_MS = 15_000;

/** Path part of an href: drops ?search and #hash; a search-only href is "/". */
export function pathnameOf(href: string): string {
  return href.split("#")[0].split("?")[0] || "/";
}

function withoutHash(href: string): string {
  return href.split("#")[0];
}

/**
 * Tracks the one navigation in flight (ADR 0063). Holding the old page until
 * the new one is ready (no loading.tsx between the shell and the page) means
 * nothing on screen changes when a control is tapped — so the tapped control
 * reports here, nav controls read useEffectivePathname() to light the target
 * at once, and NavigationProgress shows a bar if the wait drags on.
 *
 * Fed by AppLink (via next/link's onNavigate, which fires only for a real
 * client-side navigation — never a modifier-click or a new tab) and by
 * useAppRouter's push/replace. Settles when the URL changes; a navigation to
 * the URL already shown is not recorded, because nothing would ever settle it.
 */
export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const current = search ? `${pathname}?${search}` : pathname;
  const [pending, setPending] = React.useState<PendingNavigation | null>(null);

  // Settle on URL change. Adjusted during render (React's "adjusting state
  // when a prop changes" pattern, as day-swipe.tsx does) rather than in an
  // effect, which react-hooks/set-state-in-effect flags.
  const [seenCurrent, setSeenCurrent] = React.useState(current);
  if (seenCurrent !== current) {
    setSeenCurrent(current);
    setPending(null);
  }

  React.useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), PENDING_NAVIGATION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const begin = React.useCallback(
    (href: string) => {
      if (href.startsWith("#")) return; // same page, different scroll position
      if (withoutHash(href) === current) return; // already here: nothing to wait for
      setPending({ href, pathname: pathnameOf(href), startedAt: Date.now() });
    },
    [current],
  );

  const value = React.useMemo(() => ({ pending, begin }), [pending, begin]);
  return <NavigationPendingContext.Provider value={value}>{children}</NavigationPendingContext.Provider>;
}

export function useNavigationPending(): PendingNavigation | null {
  return React.useContext(NavigationPendingContext).pending;
}

export function useBeginNavigation(): (href: string) => void {
  return React.useContext(NavigationPendingContext).begin;
}

/**
 * The pathname a nav control should light for: the tapped target while a
 * navigation is in flight, otherwise the real one. Outside the provider (a
 * boundary shell, a test) it is simply the real pathname.
 */
export function useEffectivePathname(): string {
  const real = usePathname() ?? "";
  const pending = useNavigationPending();
  return pending ? pending.pathname : real;
}
