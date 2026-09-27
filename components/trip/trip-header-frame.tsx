"use client";

import { usePathname } from "next/navigation";
import { isTripHomePath } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * The trip layout's header box (name, dates, members, fork switcher, bell).
 * Controller ruling R2: it stays on every route below lg; on the Home route
 * (/trips/:id exactly) it is lg:hidden, because the desktop Home renders its
 * own header there (Task 15). Other routes keep it at every width.
 *
 * data-trip-header stays on this element: the print route hides it by that
 * hook.
 */
export function TripHeaderFrame({ children }: { children: React.ReactNode }) {
  const isHome = isTripHomePath(usePathname());
  return (
    <div data-trip-header data-trip-home={isHome ? "" : undefined} className={cn("pb-4 pt-2", isHome && "lg:hidden")}>
      {children}
    </div>
  );
}
