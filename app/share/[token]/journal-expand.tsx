"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface JournalExpandProps {
  heading: React.ReactNode;
  count: number;
  mobileLimit: number;
  mobileLayout: "scroller" | "grid";
  items: React.ReactNode[];
}

/**
 * The header row (heading + mobile "N entries" toggle) and the responsive
 * list around the polaroid cards `journal-polaroids.tsx` renders. Split out
 * as a client component only for the expand/collapse state — the cards
 * themselves stay server-rendered.
 */
export function JournalExpand({ heading, count, mobileLimit, mobileLayout, items }: JournalExpandProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        {heading}
        {count > mobileLimit && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-bold lg:hidden"
          >
            {expanded ? "Show fewer" : `${count} entries`}
            <ChevronRight aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <ul
        className={cn(
          "mt-3",
          mobileLayout === "grid" ? "grid grid-cols-2 gap-3" : "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2",
          // pt-2: the scroller clips vertically too; leave room for the hover lift (S9).
          "lg:flex lg:snap-x lg:gap-6 lg:overflow-x-auto lg:pb-3 lg:pt-2",
        )}
      >
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              mobileLayout === "scroller" ? "w-[200px] shrink-0 snap-start" : "",
              "lg:w-[250px] lg:shrink-0 lg:snap-start",
              !expanded && i >= mobileLimit && "max-lg:hidden",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
