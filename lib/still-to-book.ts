/**
 * Home's "Still to book" (spec 2026-10-17 R2): every Item, Transport leg and
 * Accommodation that is To book (CONTEXT.md "Booking state"), soonest
 * book-by date first, then by when it happens, undated last. The loader
 * (lib/desktop-home-loader.ts) reads the real plan only and applies the
 * Surprise fragments, so nothing hidden from the viewer reaches here.
 *
 * PURE — no Prisma/React.
 */
import type { Route } from "next";
import type { BookingState } from "@/lib/enum-values";
import { formatDayLabel } from "@/lib/dates";
import { tripSubPath } from "@/lib/trip-path";

export type StillToBookKind = "ITEM" | "TRANSPORT" | "ACCOMMODATION";

export interface StillToBookSource {
  kind: StillToBookKind;
  id: string;
  /** An Item's title, a stay's name, a leg's "Train · A → B" (lib/money/cost-labels.ts). */
  label: string;
  bookingState: BookingState;
  bookBy: string | null;
  /** When it happens: an Item's date, a leg's departure day in its own zone, a stay's check-in. */
  date: string | null;
  /** Where it lives in the Plan: an Item's or stay's Stop, a leg's slot. */
  stopId: string | null;
}

export interface StillToBookRow {
  id: string;
  kind: StillToBookKind;
  title: string;
  subtitle: string;
  href: Route;
  bookBy: string | null;
}

export const STILL_TO_BOOK_LIMIT_PHONE = 5;
export const STILL_TO_BOOK_LIMIT_DESKTOP = 6;

const WHEN: Record<StillToBookKind, string> = { ITEM: "", TRANSPORT: "Leaves ", ACCOMMODATION: "Check-in " };

/** Ascending, nulls last. */
function byNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function hrefFor(s: StillToBookSource, basePath: string): Route {
  if (s.date && s.kind !== "ACCOMMODATION") return tripSubPath(basePath, `/day/${s.date}`);
  if (s.stopId) return tripSubPath(basePath, `/plan?stop=${encodeURIComponent(s.stopId)}`);
  return tripSubPath(basePath, "/plan");
}

export function buildStillToBook(sources: StillToBookSource[], basePath: string): StillToBookRow[] {
  return sources
    .filter((s) => s.bookingState === "TO_BOOK")
    .sort((a, b) => byNullable(a.bookBy, b.bookBy) || byNullable(a.date, b.date) || a.label.localeCompare(b.label))
    .map((s) => {
      const parts = [
        s.bookBy ? `Book by ${formatDayLabel(s.bookBy)}` : null,
        s.date ? `${WHEN[s.kind]}${formatDayLabel(s.date)}` : null,
      ].filter((p): p is string => p !== null);
      return {
        id: s.id, // cuids are unique across the three tables
        kind: s.kind,
        title: s.label,
        subtitle: parts.join(" · ") || "No date yet",
        href: hrefFor(s, basePath),
        bookBy: s.bookBy,
      };
    });
}
