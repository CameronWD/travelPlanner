"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const THRESHOLD = 40;

/** Horizontal swipe on the page body changes day (DAY_VIEW §3.4). */
export function DaySwipe({ prevHref, nextHref, children }: { prevHref: string | null; nextHref: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const start = React.useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const [leaving, setLeaving] = React.useState<"left" | "right" | null>(null);
  return (
    <div
      className={cn("transition-[transform,opacity] duration-150 motion-reduce:transition-none", leaving === "left" && "-translate-x-6 opacity-0", leaving === "right" && "translate-x-6 opacity-0")}
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ignore: !!t.closest("[data-day-strip],[data-journal]") };
      }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        if (!s || s.ignore) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
        const href = dx < 0 ? nextHref : prevHref;
        if (!href) return;
        setLeaving(dx < 0 ? "left" : "right");
        router.push(href);
      }}
    >
      {children}
    </div>
  );
}
