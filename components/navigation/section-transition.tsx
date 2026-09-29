"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";

/**
 * Keys a layout's child segment so the old section unmounts and the new one
 * mounts as a pair when the segment changes — Plan → Money, Trips → Globe —
 * and nothing happens for changes deeper down (day → day). The old page holds
 * until the new one is ready (ADR 0063) and then swaps in one frame: no view
 * transition, no fade (ADR 0065 — the crossfade still overlapped on the
 * iPhone PWA, and a cut depends on nothing the browser may not honour).
 */
export function SectionTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment() ?? "__index";
  return (
    <div key={segment} data-section={segment} className="w-full">
      {children}
    </div>
  );
}
