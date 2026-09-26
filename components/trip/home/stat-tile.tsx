import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "white" | "coral" | "sun" | "teal" | "lilac";
  /** Makes the whole tile a link onto the tab it summarises. */
  href?: string;
  /** Extra classes for the outermost element (the link when `href` is set). */
  className?: string;
}

/**
 * Kit DHome.jsx StatCard as a Trip home grid tile (spec E1): Label → value →
 * sub, filling its grid cell so a row of tiles lines up at one height.
 * Server Component.
 */
export function StatTile({ label, value, sub, tone = "white", href, className }: StatTileProps) {
  const body = (
    <>
      <div className="text-label">{label}</div>
      <div className="mt-1 truncate font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em]">
        {value}
      </div>
      {sub ? <div className="mt-auto line-clamp-2 pt-1.5 text-xs font-semibold">{sub}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} data-stat-tile className={cn("block h-full rounded-lg", className)}>
        <Card tone={tone} interactive className="flex h-full w-full min-w-0 flex-col p-3.5">
          {body}
        </Card>
      </Link>
    );
  }
  return (
    <Card data-stat-tile tone={tone} className={cn("flex h-full min-w-0 flex-col p-3.5", className)}>
      {body}
    </Card>
  );
}
