"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

export interface DockItem { href: string; label: string; muted?: boolean }

/** Client Component. md+ left rail (96px, sun). Avatars of trip members pinned to the bottom (pass as children). */
function Dock({ items, children, className }: { items: DockItem[]; children?: React.ReactNode; className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Trip" className={cn("island hidden w-24 shrink-0 flex-col items-center gap-2 border-r-2 border-border bg-sun py-5 md:flex", className)}>
      <Link href="/" aria-label="Teepee home" className="mb-3.5 grid size-11 place-items-center rounded-md bg-[hsl(var(--on-accent))]"><Logo variant="mark" size={30} /></Link>
      {items.map(it => { const on = path.startsWith(it.href); return (
        <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
          className={cn("grid h-10 w-16 place-items-center rounded-md border-2 text-[11px] font-bold", on ? "border-border bg-coral font-extrabold shadow-hard-1" : "border-transparent", it.muted && !on && "text-muted-foreground")}>
          {it.label}
        </Link>
      ); })}
      <div className="mt-auto flex flex-col gap-1.5">{children}</div>
    </nav>
  );
}

export { Dock };
