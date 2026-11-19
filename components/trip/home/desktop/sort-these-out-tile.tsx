import type { Route } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { SortRow } from "@/lib/sort-these-out";
import { SortTheseOutRows } from "@/components/trip/home/desktop/sort-these-out-rows";

export { ICONS, TONES } from "@/components/trip/home/desktop/sort-row-style";

export interface SortTheseOutTileProps {
  rows: SortRow[];
  /** Everything there is to sort out (rows are capped at 4). */
  total: number;
  seeAllHref: Route;
}

/**
 * Desktop Home "Sort these out" tile (spec 2026-09-27-desktop-home §7 with
 * beta-feedback §C): up to 6 rows (SORT_ROW_LIMIT_DESKTOP) from lib/sort-these-out.ts, each a link;
 * the count badge shows everything there is to do (never a bare 0).
 */
export function SortTheseOutTile({ rows, total, seeAllHref }: SortTheseOutTileProps) {
  return (
    <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col gap-1 overflow-hidden p-[22px]">
      <SortTheseOutRows rows={rows} total={total} />
      <Link
        href={seeAllHref}
        className="mt-auto inline-flex min-h-11 items-center self-start text-sm font-bold"
      >
        See all in Summary →
      </Link>
    </Card>
  );
}
