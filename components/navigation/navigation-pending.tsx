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
  settle: (href: string) => void;
}

const NavigationPendingContext = React.createContext<NavigationPendingValue>({ pending: null, begin: () => {}, settle: () => {} });

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
 * useAppRouter's push/replace. Settled three ways, because a navigation can
 * end without the URL changing (a server redirect() back to the page shown —
 * the Days tab of a date-less Trip from Plan — or a tap on the page already
 * shown that supersedes one in flight):
 * - settle(href), reported when that link's useLinkStatus() or that push's
 *   transition goes idle — clears only if it is still the one in flight;
 * - begin() of the URL already shown clears it (Next discards the earlier
 *   navigation, so nothing else would);
 * - backstops: any URL change, and PENDING_NAVIGATION_TIMEOUT_MS.
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

  // begin reads the URL through a ref so its identity is stable: useAppRouter
  // memoises on it, and a new router object on every URL change made
  // DayKeyboardNav re-subscribe its key listener each time.
  const currentRef = React.useRef(current);
  React.useLayoutEffect(() => {
    currentRef.current = current;
  }, [current]);

  const begin = React.useCallback((href: string) => {
    // Same page (a hash-only link, or the URL already shown): nothing to wait
    // for — and it supersedes anything in flight, so clear rather than ignore.
    if (href.startsWith("#") || withoutHash(href) === currentRef.current) {
      setPending(null);
      return;
    }
    // A second report of the same navigation (onNavigate, then useLinkStatus)
    // keeps its start time.
    setPending((prev) => (prev?.href === href ? prev : { href, pathname: pathnameOf(href), startedAt: Date.now() }));
  }, []);

  const settle = React.useCallback((href: string) => {
    setPending((prev) => (prev?.href === href ? null : prev));
  }, []);

  const value = React.useMemo(() => ({ pending, begin, settle }), [pending, begin, settle]);
  return <NavigationPendingContext.Provider value={value}>{children}</NavigationPendingContext.Provider>;
}

export function useNavigationPending(): PendingNavigation | null {
  return React.useContext(NavigationPendingContext).pending;
}

export function useBeginNavigation(): (href: string) => void {
  return React.useContext(NavigationPendingContext).begin;
}

/** Clears the pending state if `href` is still the navigation in flight. */
export function useSettleNavigation(): (href: string) => void {
  return React.useContext(NavigationPendingContext).settle;
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

export interface NavState {
  /** The real pathname — what aria-current describes (the page actually shown). */
  pathname: string;
  /** The pending target's pathname while in flight, else the real one — what nav controls light. */
  effectivePathname: string;
  /** The pending target's pathname, or null — nav controls mark it data-pending="true". */
  pendingPathname: string | null;
}

/**
 * Everything a nav control needs to render its items (ADR 0063): light the
 * tapped target at once from effectivePathname, but keep aria-current on the
 * page actually shown until the new one has loaded.
 */
export function useNavState(): NavState {
  const pathname = usePathname() ?? "";
  const pending = useNavigationPending();
  return { pathname, effectivePathname: pending ? pending.pathname : pathname, pendingPathname: pending?.pathname ?? null };
}
