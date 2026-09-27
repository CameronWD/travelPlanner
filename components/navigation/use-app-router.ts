"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useBeginNavigation } from "@/components/navigation/navigation-pending";

type Router = ReturnType<typeof useRouter>;

/**
 * `useRouter` whose push/replace also report to NavigationPendingProvider
 * (ADR 0063) — for controls that navigate programmatically: the Day keyboard
 * arrows and swipe, the command palette, the fork switcher, the route map.
 */
export function useAppRouter(): Router {
  const router = useRouter();
  const begin = useBeginNavigation();
  return React.useMemo<Router>(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<Router["push"]>[1]) => {
        begin(href);
        router.push(href, options);
      },
      replace: (href: string, options?: Parameters<Router["replace"]>[1]) => {
        begin(href);
        router.replace(href, options);
      },
    }),
    [router, begin],
  );
}
