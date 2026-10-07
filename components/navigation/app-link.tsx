"use client";

import * as React from "react";
import type { Route } from "next";
import type { UrlObject } from "url";
import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";
import { useBeginNavigation, useNavigationPending, useSettleNavigation } from "@/components/navigation/navigation-pending";

// With typedRoutes, next/link's own href is generic over the literal it is
// given; a wrapper cannot forward that inference, so it takes a Route — a
// literal static path, or one already typed by tripPath/useTripHref.
type LinkProps = Omit<React.ComponentProps<typeof Link>, "href">;

export interface AppLinkProps extends LinkProps {
  href: Route | UrlObject;
  /** Classes added while THIS link's navigation is in flight (the Day arrows' pressed look). */
  pendingClassName?: string;
}

/**
 * `next/link` that reports its navigation to NavigationPendingProvider (ADR
 * 0063). Every in-app nav control uses this rather than next/link directly,
 * so the tapped target lights at once and NavigationProgress can show a bar.
 * `onNavigate` fires only for a client-side navigation — never a
 * modifier-click, a new tab or a download — so those never leave a pending
 * state behind. A non-string href (UrlObject) is passed through untracked.
 *
 * LinkStatusReporter settles it: next/link's own pending flag goes idle when
 * the navigation's transition ends, which is the only end signal for a
 * navigation that lands back on the URL already shown (a server redirect).
 */
export const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, onNavigate, pendingClassName, className, children, ...rest },
  ref,
) {
  const begin = useBeginNavigation();
  const pending = useNavigationPending();
  const hrefString = typeof href === "string" ? href : null;
  const isPending = hrefString != null && pending?.href === hrefString;
  return (
    <Link
      ref={ref}
      href={href}
      className={cn(className, isPending && pendingClassName)}
      onNavigate={(e) => {
        let prevented = false;
        onNavigate?.({
          preventDefault() {
            prevented = true;
            e.preventDefault();
          },
        });
        if (!prevented && hrefString != null) begin(hrefString);
      }}
      {...rest}
    >
      {hrefString != null ? <LinkStatusReporter href={hrefString} /> : null}
      {children}
    </Link>
  );
});

/**
 * Renders nothing; must sit inside <Link> because useLinkStatus() reads the
 * nearest Link's status. Pending → begin (a second report is a no-op);
 * pending → idle → settle(href), which clears only this link's navigation.
 */
function LinkStatusReporter({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  const begin = useBeginNavigation();
  const settle = useSettleNavigation();
  const wasPending = React.useRef(false);
  React.useEffect(() => {
    if (pending) {
      wasPending.current = true;
      begin(href);
    } else if (wasPending.current) {
      wasPending.current = false;
      settle(href);
    }
  }, [pending, href, begin, settle]);
  return null;
}
