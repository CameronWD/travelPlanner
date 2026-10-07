import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Calendar,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ListChecks,
  MapPin,
  Plane,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import type { SortIcon, SortRow, SortTone } from "@/lib/sort-these-out";

export const ICONS: Record<SortIcon, LucideIcon> = {
  bell: Bell,
  plane: Plane,
  "list-checks": ListChecks,
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  "circle-alert": CircleAlert,
  "map-pin": MapPin,
  check: Check,
};

// Written out in full so Tailwind's scanner sees each class.
export const TONES: Record<SortTone, string> = {
  coral: "bg-coral",
  sun: "bg-sun",
  teal: "bg-teal",
  lilac: "bg-lilac",
  pink: "bg-hue-pink",
  stone: "bg-hue-stone",
};

export interface SortTheseOutTileProps {
  rows: SortRow[];
  /** Everything there is to sort out (rows are capped at 4). */
  total: number;
  seeAllHref: Route;
}

function RowBody({ row }: { row: SortRow }) {
  const Icon = ICONS[row.icon];
  return (
    <>
      <span
        data-sort-tile
        aria-hidden="true"
        className={cn(
          "island grid size-10 shrink-0 place-items-center rounded-[12px] border-2 border-border",
          TONES[row.tone],
        )}
      >
        <Icon className="size-5" strokeWidth={2.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{row.title}</span>
        {row.subtitle ? (
          <span className="truncate text-[13px] text-muted-foreground">{row.subtitle}</span>
        ) : null}
      </span>
      {row.href ? <ChevronRight className="size-5 shrink-0" aria-hidden="true" /> : null}
    </>
  );
}

/**
 * Desktop Home "Sort these out" tile (spec 2026-09-27-desktop-home §7 with
 * beta-feedback §C): up to 6 rows (SORT_ROW_LIMIT_DESKTOP) from lib/sort-these-out.ts, each a link;
 * the count badge shows everything there is to do (never a bare 0).
 */
export function SortTheseOutTile({ rows, total, seeAllHref }: SortTheseOutTileProps) {
  return (
    <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col gap-1 overflow-hidden p-[22px]">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em]">Sort these out</h2>
        {total > 0 ? (
          <span
            aria-label={`${total} ${total === 1 ? "thing" : "things"} to sort out`}
            className="island grid h-[26px] min-w-[26px] place-items-center rounded-full border-2 border-border bg-coral px-1.5 text-xs font-extrabold"
          >
            {total}
          </span>
        ) : null}
      </div>
      <ul className="flex min-h-0 flex-col overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className="border-t-2 border-border-soft">
            {row.href ? (
              <Link
                href={row.href}
                className="flex min-h-11 items-center gap-3.5 rounded-md py-2.5 hover:bg-muted/40"
              >
                <RowBody row={row} />
              </Link>
            ) : (
              <div className="flex items-center gap-3.5 py-2.5">
                <RowBody row={row} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <Link
        href={seeAllHref}
        className="mt-auto inline-flex min-h-11 items-center self-start text-sm font-bold"
      >
        See all in Summary →
      </Link>
    </Card>
  );
}
