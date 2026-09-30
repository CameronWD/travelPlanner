"use client";

import Link from "next/link";
import { House } from "lucide-react";
import { useTripHref } from "@/components/trip/use-trip-href";
import { formatDayLabel } from "@/lib/dates";

export interface HomeBaseBookendProps {
  tripId: string;
  name: string;
  /** "origin" = trip start (rendered at the top); "return" = trip end (bottom). */
  variant: "origin" | "return";
  dateISO: string | null;
}

/**
 * The Home base bookend row (PLAN.md §1.3): a slim dashed row, not a Stop —
 * not draggable, not deletable. Clicking it opens trip settings, where the
 * Home base is edited. Keeps the jump ids the Stops list scrolls to.
 */
export function HomeBaseBookend({ tripId, name, variant, dateISO }: HomeBaseBookendProps) {
  const id = variant === "origin" ? "home-base-top" : "home-base-bottom";
  const tripHref = useTripHref(tripId);
  const meta = dateISO ? `Home base · ${variant === "origin" ? "leave" : "back"} ${formatDayLabel(dateISO)}` : "Home base";
  return (
    <Link
      id={id}
      href={tripHref("/settings")}
      aria-label={`Home base: ${name} — edit in trip settings`}
      className="pressable flex h-11 scroll-mt-6 items-center gap-2.5 rounded-[14px] border-2 border-dashed border-border bg-background px-3.5"
    >
      <House className="size-4" aria-hidden />
      <span className="text-sm font-bold">{name}</span>
      <span className="text-[13px] font-semibold text-muted-foreground">{meta}</span>
    </Link>
  );
}
