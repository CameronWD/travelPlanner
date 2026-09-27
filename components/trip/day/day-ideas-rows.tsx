"use client";
import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { categoryClasses, CATEGORIES } from "@/lib/categories";
import type { IdeaRow } from "@/lib/day-view-model";
import { scheduleItem } from "@/server/actions/items";
import { toast } from "@/components/ui/use-toast";
import { CATEGORY_ICON } from "@/lib/category-icons";

const CATEGORIES_BY_VALUE = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.value, c]));

/** The empty day's Day ideas (spec decision 5, ADR 0044 amendment): three rows, "+ Add" schedules with no time. */
export function DayIdeasRows({ date, dateLabel, rows, more, eyebrow, seeAllHref, size }: { tripId: string; date: string; dateLabel: string; rows: IdeaRow[]; more: number; eyebrow: string | null; seeAllHref: string; size: "desktop" | "phone" }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [, start] = React.useTransition();
  if (rows.length === 0) return null;
  const phone = size === "phone";
  function add(row: IdeaRow) {
    setPending(row.id);
    start(async () => {
      try {
        const r = await scheduleItem(row.id, { date });
        if (r.success) toast({ title: `Added to ${dateLabel}`, description: row.title });
        else toast({ variant: "destructive", title: "Couldn't add it", description: r.errors ? Object.values(r.errors)[0]?.[0] : undefined });
      } finally { setPending(null); }
    });
  }
  return (
    <div className="flex flex-col gap-2.5">
      {eyebrow ? <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p> : null}
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const meta = CATEGORIES_BY_VALUE.get(row.category);
          const Icon = meta ? CATEGORY_ICON[meta.icon] : undefined;
          return (
            <li key={row.id} className="flex items-center gap-3 rounded-[16px] border-2 border-border bg-card px-3 py-2.5">
              <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-[12px] border-2 border-border", categoryClasses(row.category).fill, "text-on-accent")}>
                {Icon ? <Icon className="size-[18px]" strokeWidth={2.5} /> : <span className="size-2.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-foreground">{row.title}</span>
                {row.hint ? <span className="block truncate text-[13px] text-muted-foreground">{row.hint}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Add ${row.title} to ${dateLabel}`}
                disabled={pending === row.id}
                onClick={() => add(row)}
                className={cn("pressable inline-flex shrink-0 items-center justify-center rounded-full border-2 border-border bg-card font-extrabold text-foreground shadow-[2px_2px_0_hsl(var(--shadow-ink))] disabled:opacity-50", phone ? "size-11 rounded-[12px]" : "h-[34px] px-3 text-[13px]")}
              >
                {phone ? <Plus className="size-5" aria-hidden="true" /> : "+ Add"}
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 ? <Link href={seeAllHref} className="text-[13px] font-bold text-foreground underline underline-offset-2">See all ({more} more)</Link> : null}
    </div>
  );
}
