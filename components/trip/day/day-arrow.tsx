"use client";

import type { Route } from "next";
import { AppLink } from "@/components/navigation/app-link";
import { DAY_BACK, DAY_FORWARD } from "@/components/trip/day/day-transition";
import { useDayCarousel } from "@/components/trip/day/day-carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";

const ARROW =
  "pressable inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground shadow-hard-1 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";
const ARROW_OFF = "inline-grid size-11 shrink-0 place-items-center rounded-[12px] border-2 border-border bg-card text-foreground opacity-40";

/**
 * 44px prev/next day arrow — a real link (works without JS); 40% and inert at
 * the trip's ends. With the carousel mounted it glides the body to the
 * neighbour and navigates on arrival (ADR 0065); otherwise the link runs the
 * page-turn. Either way the vertical position is kept.
 */
export function DayArrow({ href, label, dir }: { href: Route | null; label: string | null; dir: "prev" | "next" }) {
  const carousel = useDayCarousel();
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const icon = <Icon className="size-5" strokeWidth={2.5} aria-hidden="true" />;
  if (!href) {
    return (
      <span aria-label={dir === "prev" ? "Previous day" : "Next day"} aria-disabled="true" role="link" className={ARROW_OFF}>
        {icon}
      </span>
    );
  }
  return (
    <AppLink
      href={href}
      scroll={false}
      aria-label={label ?? undefined}
      transitionTypes={[dir === "prev" ? DAY_BACK : DAY_FORWARD]}
      className={ARROW}
      // Lit the moment it is tapped: the page holds until the next day is ready (ADR 0063).
      pendingClassName="translate-y-px bg-coral shadow-none"
      onNavigate={(e) => {
        if (carousel?.goTo(href)) e.preventDefault();
      }}
    >
      {icon}
    </AppLink>
  );
}
