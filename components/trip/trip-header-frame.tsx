"use client";

import { usePathname } from "next/navigation";
import { isTripDayPath, isTripHomePath } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * The trip layout's header box (name, dates, members, fork switcher, bell).
 * Controller ruling R2: it stays on every route below lg; on the Home route
 * (/trips/:id exactly) and the Day view (/trips/:id/day[/:date], spec
 * 2026-09-27 §C) render their own header instead: Home is lg:hidden; the Day
 * view hides it at every width (its h1 is the date, and its own header
 * carries the switcher pill and bell below lg — the 2026-09-27 handoff's
 * phone top bar). Other routes keep it at every width.
 *
 * data-trip-header stays on this element: the print route hides it by that
 * hook.
 */
export function TripHeaderFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = isTripHomePath(pathname);
  const isDay = isTripDayPath(pathname);
  // The Day view hides it at every width: its own header carries the
  // switcher pill and bell below lg, so the date stays the page's only h1.
  const hideAtLg = isHome && !isDay;
  return (
    <div
      data-trip-header
      data-trip-home={isHome ? "" : undefined}
      data-trip-day={isDay ? "" : undefined}
      className={cn("pb-4 pt-2", hideAtLg && "lg:hidden", isDay && "hidden")}
    >
      {children}
    </div>
  );
}
