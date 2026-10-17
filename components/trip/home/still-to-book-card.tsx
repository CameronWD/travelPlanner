import type { Route } from "next";
import Link from "next/link";
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BedDouble, ChevronRight, Plane, Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import type { StillToBookKind, StillToBookRow } from "@/lib/still-to-book";

const ICON: Record<StillToBookKind, LucideIcon> = { TRANSPORT: Plane, ACCOMMODATION: BedDouble, ITEM: Ticket };

/**
 * Home's "Still to book" (spec 2026-10-17 R2; CONTEXT.md "Booking state"):
 * what is still To book, soonest book-by date first, each row a link to its
 * thing. Phone (Planning/Final-prep) and desktop share it; the caller sets
 * `limit`. Nothing to book, nothing shown.
 *
 * Both Home trees render on one page (CSS picks one), so the heading id comes
 * from `useId` rather than a fixed string.
 */
export function StillToBookCard({ rows, limit, planHref }: { rows: StillToBookRow[]; limit: number; planHref: Route }) {
  const headingId = useId();
  if (rows.length === 0) return null;
  const shown = rows.slice(0, limit);
  const more = rows.length - shown.length;
  return (
    <Card className="p-4" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          Still to book
          <span className="sr-only">, {rows.length}</span>
        </h2>
        <CountBadge count={rows.length} />
      </div>
      <ul className="mt-1.5 flex flex-col">
        {shown.map((r) => {
          const Icon = ICON[r.kind];
          return (
            <li key={r.id}>
              <Link href={r.href} className="flex min-h-11 items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-muted/40">
                <span aria-hidden="true" className="grid size-[34px] shrink-0 place-items-center rounded-sm border-2 border-border bg-warning text-warning-foreground">
                  <Icon className="size-4" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{r.title}</span>
                  <span className="block text-xs font-medium text-muted-foreground">{r.subtitle}</span>
                </span>
                <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <Link href={planHref} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-extrabold text-foreground hover:underline">
          {more} more to book <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}
