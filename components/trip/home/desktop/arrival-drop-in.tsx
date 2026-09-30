"use client";

import * as React from "react";
import { takeArrival } from "@/lib/new-trip/arrival";

/**
 * Drops the countdown tile in on the first visit after New trip (MOTION N13;
 * no View Transitions morph — spec C5). Trip home is server-rendered, so the
 * flag is read after mount and the class added to the DOM directly: the
 * server and first client render stay identical.
 */
export function ArrivalDropIn({ tripId, className, children }: { tripId: string; className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (takeArrival(tripId)) ref.current?.classList.add("tp-drop-in");
  }, [tripId]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
