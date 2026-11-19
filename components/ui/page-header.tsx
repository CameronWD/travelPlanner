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
  // Below md: a 2-column grid. The title column dissolves into it so the
  // eyebrow (trip name) shares row 1 with the layout cluster (fork pill, share,
  // bell) in column 2; the h1 takes row 2, the meta line the row after. With no
  // eyebrow and no cluster the h1 takes row 1 so nothing reserves an empty row.
  // The h1 and the round action both span the two columns (a spanning item
  // never sizes the auto column), so column 2 is only as wide as the cluster
  // and the h1 keeps the row's width less the action's.
  // From md: one flex row that wraps — the side cluster (trailing + actions)
  // becomes a single flex unit (`contents` → `md:flex`) and drops under the
  // title as a group, right-aligned, when it does not fit (and wraps within
  // itself when even a full row cannot hold it, so 768 never scrolls sideways); the title column
  // never shrinks below 14rem and the h1 never breaks inside a word.
  const h1Row = eyebrow || trailing ? "row-start-2" : "row-start-1";
  const metaRow = eyebrow || trailing ? "row-start-3" : "row-start-2";
  const eyebrowTitle = typeof eyebrow === "string" ? eyebrow : undefined;
  return (
    <header
      data-slot="page-header"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 md:flex md:flex-wrap md:items-end md:gap-4"
    >
      <div data-slot="page-header-title" className="col-start-1 flex min-w-0 flex-col max-md:contents md:min-w-[14rem] md:flex-1">
        {eyebrow ? (
          <p className="col-start-1 row-start-1 truncate text-sm font-medium text-muted-foreground max-md:self-center md:text-[15px]" title={eyebrowTitle}>
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "col-span-2 col-start-1 mt-0.5 font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-foreground [overflow-wrap:normal] md:text-[40px]",
            h1Row,
            mobileAction && "max-md:pr-14",
          )}
        >
          {title}
        </h1>
        {meta ? (
          <p className={cn("col-span-2 mt-1.5 text-[15px] font-semibold text-foreground/80", metaRow, !metaOnMobile && "hidden md:block")}>{meta}</p>
        ) : null}
      </div>
      {hasSide ? (
        <div data-slot="page-header-side" className="contents md:ml-auto md:flex md:max-w-full md:flex-wrap md:items-center md:justify-end md:gap-2.5">
          {trailing ? (
            <div data-slot="page-header-trailing" className="col-start-2 row-start-1 flex items-center justify-end self-center md:contents">
              {trailing}
            </div>
          ) : null}
          {actions ? (
            <div data-slot="page-header-actions" className="hidden items-center gap-2.5 md:flex">
              {actions}
            </div>
          ) : null}
          {mobileAction ? (
            <div data-slot="page-header-mobile-action" className={cn("col-span-2 col-start-1 justify-self-end self-center", h1Row, "md:hidden")}>
              {mobileAction}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
