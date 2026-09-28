"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { ViewTransition } from "@/components/ui/view-transition";

export const SECTION_CROSSFADE = "tp-crossfade";

/**
 * Crossfades a layout's child segment when it changes — Plan → Money, Trips →
 * Globe — and does nothing for changes deeper down (day → day, which the Day
 * body animates itself) or for untyped updates. Keyed on the segment so the
 * old section exits and the new one enters as a pair; the old one stays on
 * screen until the new one's data has arrived (ADR 0063, replacing the trip
 * template.tsx + PageTransition remount-and-fade of ADR 0006).
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment() ?? "__index";
  return (
    <ViewTransition key={segment} enter={SECTION_CROSSFADE} exit={SECTION_CROSSFADE} default="none">
      <div data-section={segment} className="w-full">
        {children}
      </div>
    </ViewTransition>
  );
}
