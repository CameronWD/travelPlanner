"use client";

import * as React from "react";
import { ChevronDown, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { DayPickerMenu } from "@/components/trip/day-picker-menu";
import { fitTitles } from "@/components/trip/fit-titles";
import { categoryDotClass } from "@/components/trip/category-dot";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { ThingToDo } from "./types";

/**
 * Width of `ref`'s element, live via ResizeObserver. 0 on the server and in
 * jsdom (no ResizeObserver, no layout) — callers fall back to showing every
 * idea rather than trusting a bogus 0px measurement (copied from
 * components/trip/stop-day-list.tsx's useElementWidth).
 */
function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const el = ref.current;
      if (!el || typeof ResizeObserver === "undefined") return () => {};
      const observer = new ResizeObserver(() => onStoreChange());
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => ref.current?.getBoundingClientRect().width ?? 0,
    () => 0,
  );
}

export interface IdeasBoxProps {
  ideas: ThingToDo[];
  /** The stop's days to schedule onto; empty for a rough (date-less) stop. */
  days: string[];
  onPick(idea: ThingToDo, dateISO: string): void;
  onAdd(): void;
  disabled?: boolean;
}

const CHIP_CLASS =
  "tap-target pressable inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold";

/** PLAN.md §4.1 ideas box: chips per unscheduled thing-to-do, each opening a day picker to schedule it. */
export function IdeasBox({ ideas, days, onPick, onAdd, disabled = false }: IdeasBoxProps) {
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const width = useElementWidth(chipsRef);
  const shown = width
    ? fitTitles(
        ideas.map((i) => i.title),
        width,
        { charPx: 7, gapPx: 6, overflowPx: 40, itemPx: 44 },
      ).shown
    : ideas.length;
  const visible = ideas.slice(0, shown);
  const rest = ideas.slice(shown);

  const chipFor = (idea: ThingToDo) => {
    const chip = (
      <button
        type="button"
        aria-label={`Pick a day for ${idea.title}`}
        disabled={disabled}
        className={CHIP_CLASS}
      >
        <span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
        <span className="max-w-[10rem] truncate">{idea.title}</span>
        {idea.hiddenFromShares && (
          <span role="img" aria-label="Hidden from shares">
            <EyeOff className="size-3" aria-hidden="true" />
          </span>
        )}
        {days.length > 0 && <ChevronDown className="size-3.5 text-coral-text" aria-hidden="true" />}
      </button>
    );
    if (days.length === 0) {
      return (
        <span key={idea.id} className={CHIP_CLASS}>
          <span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
          <span className="max-w-[10rem] truncate">{idea.title}</span>
          {idea.hiddenFromShares && (
            <span role="img" aria-label="Hidden from shares">
              <EyeOff className="size-3" aria-hidden="true" />
            </span>
          )}
        </span>
      );
    }
    return (
      <DayPickerMenu
        key={idea.id}
        days={days}
        label={`Pick a day for ${idea.title}`}
        onPick={(d) => onPick(idea, d)}
        trigger={chip}
      />
    );
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5">
      {ideas.length > 0 && (
        <>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.08em]">{ideas.length} IDEAS</span>
          <div ref={chipsRef} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {visible.map(chipFor)}
            {rest.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={`+${rest.length} more ideas`} className={CHIP_CLASS}>
                    +{rest.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="flex w-64 flex-col gap-1.5">
                  {rest.map(chipFor)}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </>
      )}
      <button type="button" onClick={onAdd} className="tap-target shrink-0 whitespace-nowrap text-xs font-bold text-coral-text">
        + Add an idea
      </button>
    </div>
  );
}
