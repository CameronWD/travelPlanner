"use client";

import * as React from "react";
import { EyeOff } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { fitRows } from "@/components/trip/fit-titles";
import { categoryDotClass } from "@/components/trip/category-dot";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { ThingToDo } from "./types";
import { PresenceSpan } from "./presence";
import { TweenNumber } from "./tween-number";
import { useMotionTiming } from "./use-motion-timing";
import { SurpriseBadge } from "./surprise-badge";

/** MOTION.md P7: a scheduled idea's chip shrinks and fades out. */
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];
const CHIP_EXIT_TRANSITION = { duration: 0.18, ease: EASE_EXIT };

/**
 * Width and height of `ref`'s element, live via ResizeObserver. 0 and 0 on the
 * server and in jsdom (no ResizeObserver, no layout) — callers fall back to
 * showing every idea rather than trusting a bogus 0px measurement.
 *
 * Measuring height is safe only because the box is size-contained
 * ([contain:size] below): its height comes from the Stay panel beside it,
 * never from its chips, so the shown count cannot feed back into the height
 * it is decided from (the old self-sizing box looped to "Maximum update depth
 * exceeded"). The snapshot is a string so useSyncExternalStore sees a stable
 * primitive.
 */
function useElementSize(ref: React.RefObject<HTMLElement | null>, mounted: boolean): { width: number; height: number } {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const el = ref.current;
      if (!mounted || !el || typeof ResizeObserver === "undefined") return () => {};
      const observer = new ResizeObserver(() => onStoreChange());
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref, mounted],
  );
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => {
      const rect = ref.current?.getBoundingClientRect();
      return `${rect?.width ?? 0}x${rect?.height ?? 0}`;
    },
    () => "0x0",
  );
  const [width, height] = snapshot.split("x").map(Number);
  return { width, height };
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
  const { width, height } = useElementSize(chipsRef, ideas.length > 0);
  const rows = Math.max(1, Math.floor((height + 6) / (26 + 6)));
  const shown = width
    ? fitRows(
        ideas.map((i) => i.title),
        width,
        rows,
        { charPx: 6.5, gapPx: 6, overflowPx: 40, itemPx: 40, maxTextPx: 160 },
      ).shown
    : ideas.length;
  const visible = ideas.slice(0, shown);
  const rest = ideas.slice(shown);

  const chipFor = (idea: ThingToDo) =>
    // CONTEXT.md Surprise: a placeholder shows only that something is planned. Nothing to open.
    idea.surprise?.youAreSurprised ? (
      <span key={idea.id} className={CHIP_CLASS.replace("tap-target pressable ", "")}>
        <span className={cn("size-[9px] rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
        <span className="min-w-0 max-w-[10rem] truncate">{idea.title}</span>
        <SurpriseBadge view={idea.surprise} size="sm" className="border-0 px-1" />
      </span>
    ) : (
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
        {idea.surprise && <SurpriseBadge view={idea.surprise} size="sm" className="border-0 px-1" />}
      </button>
    );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5 [contain:size]",
        ideas.length > 0 ? "min-h-[74px]" : "min-h-[42px]",
        className,
      )}
    >
      <div
        data-testid="ideas-header"
        className={cn("flex h-[26px] shrink-0 items-center gap-1.5", ideas.length > 0 ? "justify-between" : "justify-start")}
      >
        {ideas.length > 0 && (
          <TweenNumber
            value={ideas.length}
            format={(v) => `${Math.round(v)} ${Math.round(v) === 1 ? "IDEA" : "IDEAS"}`}
            durationSec={0.32}
            className="shrink-0 whitespace-nowrap text-[11px] font-extrabold tracking-[0.08em] tabular-nums"
          />
        )}
        <button type="button" onClick={onAdd} className="tap-target shrink-0 whitespace-nowrap text-xs font-bold text-coral-text">
          + Add an idea
        </button>
      </div>
      {ideas.length > 0 && (
        <div
          ref={chipsRef}
          data-testid="ideas-chips"
          className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-1.5 overflow-hidden"
        >
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
      )}
    </div>
  );
}
