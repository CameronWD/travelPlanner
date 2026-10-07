"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useBeginNavigation, useSettleNavigation } from "@/components/navigation/navigation-pending";

type Router = ReturnType<typeof useRouter>;

/**
 * `useRouter` whose push/replace also report to NavigationPendingProvider
 * (ADR 0063) — for controls that navigate programmatically: the Day keyboard
 * arrows and swipe, the command palette, the fork switcher, the route map.
 *
 * The navigation runs inside this hook's own transition, so isPending going
 * false marks its end even when the URL does not change (a server redirect
 * back to the page shown) — then settle(href) clears it if still in flight.
 * The returned object is stable across URL changes (begin/settle are), so a
 * consumer's effect that depends on it does not re-run on every navigation.
 */
export function useAppRouter(): Router {
  const router = useRouter();
  const begin = useBeginNavigation();
  const settle = useSettleNavigation();
  const [isPending, startTransition] = React.useTransition();
  const lastHref = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (isPending || lastHref.current == null) return;
    const href = lastHref.current;
    lastHref.current = null;
    settle(href);
  }, [isPending, settle]);

  return React.useMemo<Router>(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<Router["push"]>[1]) => {
        begin(href);
        lastHref.current = href;
        startTransition(() => router.push(href as Route, options));
      },
      replace: (href: string, options?: Parameters<Router["replace"]>[1]) => {
        begin(href);
        lastHref.current = href;
        startTransition(() => router.replace(href as Route, options));
      },
    }),
    [router, begin],
  );
}
