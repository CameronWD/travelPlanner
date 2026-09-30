import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  /** The trip name on trip pages; omit on account-level pages. */
  eyebrow?: React.ReactNode;
  title: string;
  /** One line; hidden below md unless `metaOnMobile`. */
  meta?: React.ReactNode;
  metaOnMobile?: boolean;
  /** md+ pills, outline first and the ink primary last. */
  actions?: React.ReactNode;
  /** Below md, the single 44px round ink button that replaces `actions`. */
  mobileAction?: React.ReactNode;
  /** The layout-provided cluster (bell, fork switcher) — every width, before the actions. */
  trailing?: React.ReactNode;
}

/**
 * The page's own header and its only h1 (AUDIT.md §1). On a trip page the
 * trip layout hides its header on this route (TripHeaderFrame +
 * isPageHeaderPath), so the eyebrow carries the trip name instead.
 */
export function PageHeader({ eyebrow, title, meta, metaOnMobile, actions, mobileAction, trailing }: PageHeaderProps) {
  const hasSide = Boolean(trailing || actions || mobileAction);
  return (
    <header data-slot="page-header" className="flex items-start gap-4 md:items-end">
      <div className="flex min-w-0 flex-1 flex-col">
        {eyebrow ? <p className="text-sm font-medium text-muted-foreground md:text-[15px]">{eyebrow}</p> : null}
        <h1 className="mt-0.5 break-words font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground md:text-[40px]">
          {title}
        </h1>
        {meta ? (
          <p className={cn("mt-1.5 text-[15px] font-semibold text-foreground/80", !metaOnMobile && "hidden md:block")}>{meta}</p>
        ) : null}
      </div>
      {hasSide ? (
        <div data-slot="page-header-side" className="flex shrink-0 items-center gap-2.5">
          {trailing}
          {actions ? (
            <div data-slot="page-header-actions" className="hidden items-center gap-2.5 md:flex">
              {actions}
            </div>
          ) : null}
          {mobileAction ? (
            <div data-slot="page-header-mobile-action" className="md:hidden">
              {mobileAction}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
