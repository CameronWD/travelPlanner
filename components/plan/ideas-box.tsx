"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { fitTitles } from "@/components/trip/fit-titles";
import { categoryDotClass } from "@/components/trip/category-dot";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { ThingToDo } from "./types";
import { PresenceSpan } from "./presence";
import { TweenNumber } from "./tween-number";
import { useMotionTiming } from "./use-motion-timing";

/** MOTION.md P7: a scheduled idea's chip shrinks and fades out. */
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];
const CHIP_EXIT_TRANSITION = { duration: 0.18, ease: EASE_EXIT };

/**
 * Width of `ref`'s element, live via ResizeObserver. 0 on the server and in
 * jsdom (no ResizeObserver, no layout) — callers fall back to showing every
 * idea rather than trusting a bogus 0px measurement (copied from
 * components/trip/stop-day-list.tsx's useElementWidth).
 *
 * Deliberately NOT extended to also measure height: this box's own height
 * can depend on how many chips are shown (flex-wrap below), so feeding a
 * self-measured height back into the shown-count decision is a feedback
 * loop — showing more chips grows the box, which (on a height-based budget)
 * would allow showing still more, forever. "Maximum update depth exceeded"
 * is what that looks like in the browser (verified during task 28's
 * half-width top row fix). Width is safe: flex-wrap never changes this
 * element's width, only its height.
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
  onOpen(idea: ThingToDo): void;
  onAdd(): void;
  disabled?: boolean;
  className?: string;
}

const CHIP_CLASS =
  "tap-target pressable inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold";

/** PLAN.md §4.1 ideas box: chips per unscheduled thing-to-do, each opening the idea (spec 2026-10-02 §D); Pick a day lives inside the opened idea. */
export function IdeasBox({ ideas, onOpen, onAdd, disabled = false, className }: IdeasBoxProps) {
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const { t } = useMotionTiming();
  const width = useElementWidth(chipsRef);
  // How many chips show inline vs. behind "+N" is still decided by one
  // row's width (unchanged) — see useElementWidth above for why a
  // height/line budget isn't safe here. What changes is the container below
  // (flex-wrap, no overflow-hidden): the shown chips, and the "+N" chip
  // itself, now wrap onto further lines instead of being clipped off the
  // half-width top row (task 28, spec 2026-10-04 §B).
  const shown = width
    ? fitTitles(
        ideas.map((i) => i.title),
        width,
        { charPx: 7, gapPx: 6, overflowPx: 40, itemPx: 44 },
      ).shown
    : ideas.length;
  const visible = ideas.slice(0, shown);
  const rest = ideas.slice(shown);

  const chipFor = (idea: ThingToDo) => (
    <button
      key={idea.id}
      type="button"
      aria-label={`Open ${idea.title}`}
      disabled={disabled}
      className={CHIP_CLASS}
      onClick={() => onOpen(idea)}
    >
      <span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
      <span className="min-w-0 max-w-[10rem] truncate">{idea.title}</span>
      {idea.hiddenFromShares && (
        <span role="img" aria-label="Hidden from shares">
          <EyeOff className="size-3" aria-hidden="true" />
        </span>
      )}
    </button>
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5",
        className,
      )}
    >
      {ideas.length > 0 && (
        <>
          <TweenNumber
            value={ideas.length}
            format={(v) => `${Math.round(v)} ${Math.round(v) === 1 ? "IDEA" : "IDEAS"}`}
            durationSec={0.32}
            className="shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.08em] tabular-nums"
          />
          <div ref={chipsRef} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
            <AnimatePresence initial={false}>
              {visible.map((idea) => (
                <PresenceSpan key={idea.id} data-idea={idea.id} exit={{ opacity: 0, scale: 0.9, transition: t(CHIP_EXIT_TRANSITION, "exit") }} className="flex shrink-0">
                  {chipFor(idea)}
                </PresenceSpan>
              ))}
            </AnimatePresence>
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
