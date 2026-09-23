"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

export interface DockItem {
  href: string;
  label: string;
  muted?: boolean;
  /**
   * Overrides the default path.startsWith(href) active check — needed for
   * exact-match rules and hrefs carrying a query string. Unlike TabBar (which
   * shares one active index across all items and so must never fall back
   * silently), Dock computes `on` per item independently, so an item without
   * `match` only risks over-matching itself — but callers whose href is a
   * prefix of another real route (e.g. a trip's base path) still need it.
   */
  match?: (path: string) => boolean;
  /**
   * Custom content for this slot instead of the default Link — e.g. a menu
   * trigger. Receives whether this slot is active. The wrapper that supplies
   * this owns everything about the slot; Dock just gives it the item's place
   * in the ordered list.
   */
  render?: (active: boolean) => React.ReactNode;
}

/** Client Component. md+ left rail (96px, sun). Avatars of trip members pinned to the bottom (pass as children). */
function Dock({ items, children, className, "aria-label": ariaLabel = "Trip" }: { items: DockItem[]; children?: React.ReactNode; className?: string; "aria-label"?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={ariaLabel} className={cn("island hidden w-24 shrink-0 flex-col items-center gap-2 border-r-2 border-border bg-sun py-5 md:flex print:hidden", className)}>
      <Link href="/" aria-label="Teepee home" className="mb-3.5 grid size-11 place-items-center rounded-md bg-[hsl(var(--on-accent))]"><Logo variant="mark" size={30} /></Link>
      {items.map(it => {
        const on = it.match ? it.match(path) : path.startsWith(it.href);
        if (it.render) {
          return <React.Fragment key={it.href}>{it.render(on)}</React.Fragment>;
        }
        return (
          <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
            className={cn("grid h-11 w-16 place-items-center rounded-md border-2 text-[11px] font-bold", on ? "border-border bg-coral font-extrabold shadow-hard-1" : "border-transparent", it.muted && !on && "text-muted-foreground")}>
            {it.label}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1.5">{children}</div>
    </nav>
  );
}

export { Dock };
