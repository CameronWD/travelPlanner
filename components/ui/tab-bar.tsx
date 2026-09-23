"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabItem {
  href: string;
  label: string;
  match?: (path: string) => boolean;
  /**
   * Custom content for this slot instead of the default Link — e.g. a button
   * that opens a sheet rather than navigating. Receives whether this slot is
   * the active one so the caller can match the highlighted styling. The
   * wrapper that supplies this owns everything about the slot (the domain
   * knowledge of what it does); TabBar just gives it the flex-1 layout slot.
   */
  render?: (active: boolean) => React.ReactNode;
}

/**
 * Client Component. Mobile only (< md). Sliding pill indicator.
 * Drop-in replacement for components/trip/mobile-tab-bar.tsx. Height matches --tp-tab-bar-h.
 */
function TabBar({ items, className, "aria-label": ariaLabel = "Main" }: { items: TabItem[]; className?: string; "aria-label"?: string }) {
  const path = usePathname();
  // rawIdx can be -1 (no item matches — an unlisted route like a dated day
  // view). idx is ONLY for the pill's position/width math below, which needs
  // a valid array index; each item's own `active` (used for aria-current and
  // styling) is computed independently per item, never derived from idx, so
  // an unlisted route correctly leaves every item — including item 0 — inactive.
  const rawIdx = items.findIndex(i => (i.match ? i.match(path) : path.startsWith(i.href)));
  const idx = Math.max(0, rawIdx);
  const n = items.length;
  return (
    <nav aria-label={ariaLabel} className={cn("fixed inset-x-0 bottom-0 z-40 h-[calc(var(--tp-tab-bar-h)+env(safe-area-inset-bottom))] border-t-2 border-border bg-background px-3 pt-2.5 pb-[calc(1.375rem+env(safe-area-inset-bottom))] md:hidden", className)}>
      <div className="relative flex gap-1.5">
        <span aria-hidden="true" className={cn("absolute left-0 top-0 h-11 rounded-md border-2 border-border bg-coral shadow-hard-1 transition-transform duration-[var(--dur-base)] ease-bounce", rawIdx === -1 && "opacity-0")}
          style={{ width: "calc((100% - " + (n - 1) * 6 + "px) / " + n + ")", transform: "translateX(calc(" + idx + " * (100% + 6px)))" }} />
        {items.map((it) => {
          const active = it.match ? it.match(path) : path.startsWith(it.href);
          if (it.render) {
            return <React.Fragment key={it.href}>{it.render(active)}</React.Fragment>;
          }
          return (
            <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
              className={cn("relative grid h-11 min-w-0 flex-1 place-items-center truncate rounded-md text-xs transition-colors duration-[var(--dur-fast)]", active ? "font-extrabold text-on-accent" : "font-semibold text-muted-foreground")}>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { TabBar };
