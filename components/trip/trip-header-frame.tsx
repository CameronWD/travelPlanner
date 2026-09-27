"use client";

import { usePathname } from "next/navigation";
import { isTripDayPath, isTripHomePath } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * The trip layout's header box (name, dates, members, fork switcher, bell).
 * Controller ruling R2: it stays on every route below lg; on the Home route
 * (/trips/:id exactly) and the Day view (/trips/:id/day[/:date], spec
 * 2026-09-27 §C) it is lg:hidden, because those pages render their own
 * desktop header there (the Day view's h1 is the date). Other routes keep it
 * at every width.
 *
 * data-trip-header stays on this element: the print route hides it by that
 * hook.
 */
export function TripHeaderFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = isTripHomePath(pathname);
  const isDay = isTripDayPath(pathname);
  const hideAtLg = isHome || isDay;
  return (
    <div
      data-trip-header
      data-trip-home={isHome ? "" : undefined}
      data-trip-day={isDay ? "" : undefined}
      className={cn("pb-4 pt-2", hideAtLg && "lg:hidden")}
    >
      {children}
    </div>
  );
}
