"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface TabItem { href: string; label: string; match?: (path: string) => boolean }

/**
 * Client Component. Mobile only (< md). Sliding pill indicator.
 * Drop-in replacement for components/trip/mobile-tab-bar.tsx. Height matches --tp-tab-bar-h.
 */
function TabBar({ items, className }: { items: TabItem[]; className?: string }) {
  const path = usePathname();
  const idx = Math.max(0, items.findIndex(i => (i.match ? i.match(path) : path.startsWith(i.href))));
  const n = items.length;
  return (
    <nav aria-label="Main" className={cn("fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background px-3 pt-2.5 pb-[calc(1.375rem+env(safe-area-inset-bottom))] md:hidden", className)}>
      <div className="relative flex gap-1.5">
        <span aria-hidden="true" className="absolute left-0 top-0 h-11 rounded-md border-2 border-border bg-coral shadow-hard-1 transition-transform duration-[var(--dur-base)] ease-bounce"
          style={{ width: "calc((100% - " + (n - 1) * 6 + "px) / " + n + ")", transform: "translateX(calc(" + idx + " * (100% + 6px)))" }} />
        {items.map((it, i) => (
          <Link key={it.href} href={it.href} aria-current={i === idx ? "page" : undefined}
            className={cn("relative grid h-11 min-w-0 flex-1 place-items-center truncate rounded-md text-xs transition-colors duration-[var(--dur-fast)]", i === idx ? "font-extrabold text-on-accent" : "font-semibold text-muted-foreground")}>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export { TabBar };
