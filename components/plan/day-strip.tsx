"use client";

import * as React from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { categoryClasses } from "@/lib/categories";
import type { DaySlot } from "@/lib/plan/day-density";
import { stripScrollLeft } from "@/lib/plan/strip-scroll";

/** Prefix for a day slot's dnd-kit droppable id (spec §D5: same-stop-only drops). */
export const SLOT_DROP_PREFIX = "slot:";

export function slotDropId(stopId: string, dateISO: string): string {
  return `${SLOT_DROP_PREFIX}${stopId}:${dateISO}`;
}

const SCROLL_THRESHOLD = 11;

export interface DayStripProps {
  stopId: string;
  slots: DaySlot[];
  selected: string;
  onSelect(dateISO: string): void;
  onOpen(dateISO: string): void;
  panelId: string;
  flashDate?: string | null;
}

interface DaySlotButtonProps {
  stopId: string;
  slot: DaySlot;
  selected: boolean;
  panelId: string;
  flashDate?: string | null;
  onSelect(dateISO: string): void;
  onKey(e: React.KeyboardEvent<HTMLButtonElement>): void;
}

function DaySlotButton({ stopId, slot: s, selected: sel, panelId, flashDate, onSelect, onKey }: DaySlotButtonProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotDropId(stopId, s.dateISO),
    data: { type: "slot", stopId, date: s.dateISO },
  });
  const empty = s.count === 0;
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      id={`${panelId}-tab-${s.dateISO}`}
      aria-selected={sel}
      aria-controls={panelId}
      tabIndex={sel ? 0 : -1}
      data-over={isOver || undefined}
      data-flash={flashDate === s.dateISO || undefined}
      onClick={() => onSelect(s.dateISO)}
      onKeyDown={onKey}
      className={cn(
        "@container pressable flex h-16 min-w-[58px] flex-1 shrink-0 snap-start flex-col items-center overflow-hidden rounded-[14px] border-2 border-border",
        empty && !sel ? "border-dashed bg-background" : "bg-card",
        sel && "-translate-y-0.5 bg-coral text-on-accent shadow-hard-1",
      )}
    >
      <span data-band aria-hidden className={cn("h-1.5 w-full shrink-0", s.title && "border-b-[1.5px] border-border bg-sun")} />
      <span className="mt-1 flex items-center gap-0.5 text-[10px] font-extrabold tracking-[0.08em]">
        {s.changeover === "arrive" && <ArrowRight data-changeover="arrive" className="size-3" aria-hidden />}
        {s.dow} {s.num}
      </span>
      <span
        className={cn(
          "max-w-full truncate px-1 font-display text-[13px]",
          empty && !s.title ? "block" : "hidden @[90px]:block",
        )}
      >
        {s.title ?? (empty ? "Free" : "")}
      </span>
      <span className="mt-auto mb-1.5 flex gap-[3px]">
        {s.dots.map((c, i) => (
          <span key={i} data-dot className={cn("size-[7px] rounded-full border border-border", sel ? "bg-card" : categoryClasses(c).fill)} />
        ))}
      </span>
    </button>
  );
}

/**
 * The per-stop day strip (PLAN.md §4.2): a `tablist` of day slots with
 * density dots, a titled-day sun band, dashed "Free" empties and a
 * changeover glyph, plus an overflow scroller for long stays.
 */
export function DayStrip({ stopId, slots, selected, onSelect, onOpen, panelId, flashDate }: DayStripProps) {
  const scrolls = slots.length > SCROLL_THRESHOLD;
  const listRef = React.useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);
  const reduced = useReducedMotion();

  const updateArrows = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el || !scrolls) return;
    // jsdom reports 0 for both widths synchronously on mount; measure again once layout settles.
    queueMicrotask(updateArrows);
    // Scroll alone can't catch every width change: the rail resizes at the lg/xl
    // breakpoints, and a window resize or reflow changes clientWidth/scrollWidth
    // without ever firing a scroll event (mirrors components/trips/trip-carousel.tsx).
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrolls, updateArrows]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const tab = document.getElementById(`${panelId}-tab-${selected}`);
    if (!tab) return;
    const left = stripScrollLeft({
      slotLeft: tab.offsetLeft,
      slotWidth: tab.offsetWidth,
      viewportWidth: list.clientWidth,
      scrollLeft: list.scrollLeft,
    });
    if (left !== list.scrollLeft) list.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
    // `reduced` is deliberately excluded: useReducedMotion() resolves from
    // undefined to a real value shortly after mount, and re-running this
    // effect on that flip would re-scroll the strip with no selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, panelId]);

  function scrollBy(dir: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    const left = list.scrollLeft + dir * list.clientWidth * 0.8;
    list.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  }

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    const i = slots.findIndex((s) => s.dateISO === selected);
    if (i < 0) return;
    let next: DaySlot | undefined;
    if (e.key === "ArrowRight") next = slots[i + 1];
    else if (e.key === "ArrowLeft") next = slots[i - 1];
    else if (e.key === "Home") next = slots[0];
    else if (e.key === "End") next = slots[slots.length - 1];
    else if (e.key === "Enter") {
      e.preventDefault();
      onOpen(selected);
      return;
    } else return;
    e.preventDefault();
    if (!next) return;
    onSelect(next.dateISO);
    document.getElementById(`${panelId}-tab-${next.dateISO}`)?.focus();
  }

  return (
    <div className="relative flex items-center gap-1.5">
      {scrolls && (
        <button
          type="button"
          aria-label="Earlier days"
          onClick={() => scrollBy(-1)}
          className={cn(
            "tap-target grid size-9 shrink-0 place-items-center rounded-full border-2 border-border bg-card transition-opacity duration-[var(--dur-fast)]",
            !canLeft && "pointer-events-none opacity-0",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      <div
        role="tablist"
        aria-label="Days"
        ref={listRef}
        onScroll={scrolls ? updateArrows : undefined}
        className={cn("flex flex-1 gap-1.5", scrolls && "snap-x overflow-x-auto [scrollbar-width:none]")}
      >
        {slots.map((s) => (
          <DaySlotButton
            key={s.dateISO}
            stopId={stopId}
            slot={s}
            selected={s.dateISO === selected}
            panelId={panelId}
            flashDate={flashDate}
            onSelect={onSelect}
            onKey={onKey}
          />
        ))}
      </div>
      {scrolls && (
        <button
          type="button"
          aria-label="Later days"
          onClick={() => scrollBy(1)}
          className={cn(
            "tap-target grid size-9 shrink-0 place-items-center rounded-full border-2 border-border bg-card transition-opacity duration-[var(--dur-fast)]",
            !canRight && "pointer-events-none opacity-0",
          )}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
