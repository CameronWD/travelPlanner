"use client";

import { usePathname } from "next/navigation";
import { isTripDayPath } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

export function TopBarTripSlot() {
  const reserved = isTripDayPath(usePathname());
  return <div id="top-bar-trip-slot" className={cn("flex items-center", reserved ? "min-w-11" : "empty:hidden")} />;
}
