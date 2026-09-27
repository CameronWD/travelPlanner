"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useBeginNavigation, useNavigationPending } from "@/components/navigation/navigation-pending";

type LinkProps = React.ComponentProps<typeof Link>;

export interface AppLinkProps extends LinkProps {
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
 */
export const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, onNavigate, pendingClassName, className, ...rest },
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
    />
  );
});
