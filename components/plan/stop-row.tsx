"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { formatStayRange, type StayStatus } from "@/lib/plan/plan-model";
import { formatNights, nightsBetween, tzAbbrev } from "@/lib/dates";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { MapLink } from "@/components/trip/map-link";
import { MoreActionsMenu, type CardActionItem } from "@/components/trip/card-actions";
import type { StopCardStop } from "@/components/plan/types";
import { PresenceDiv } from "@/components/plan/presence";
import { useMotionTiming } from "@/components/plan/use-motion-timing";

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

export interface StopRowProps {
  stop: StopCardStop;
  number: number;
  open: boolean;
  onToggle(): void;
  bodyId: string;
  stay: StayStatus | null;
  plansCount: number;
  ideasCount: number;
  menuGroups: CardActionItem[][];
  dragHandle?: React.ReactNode;
  isPending?: boolean;
  children?: React.ReactNode;
  /** Spec 2026-10-05 §G: the stay chip opens the Stop and its stay detail view (on "No bed yet": ready to add one). */
  onOpenStay?: () => void;
}

export const STOP_ROW_GRID = "grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-4 py-3.5";

/** Clicks on these do their own thing and never toggle the row (spec 2026-10-05 §G). */
const OWN_CLICK = "button, a, input, select, textarea, label, [role='button'], [role='menuitem']";

const CHIP = "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border px-2.5 text-xs font-bold";

/** A stay chip: a button when it can open the stay view, a plain chip otherwise. */
function StayChip({
  onOpen,
  label,
  className,
  children,
}: {
  onOpen?: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!onOpen) {
    return (
      <span data-chip className={className}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-chip
      aria-label={label}
      onClick={onOpen}
      className={cn(className, "tap-target cursor-pointer hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-ring")}
    >
      {children}
    </button>
  );
}

/** The folded stop row on desktop (PLAN.md §3). */
export function StopRow({
  stop,
  number,
  open,
  onToggle,
  bodyId,
  stay,
  plansCount,
  ideasCount,
  menuGroups,
  dragHandle,
  isPending,
  children,
  onOpenStay,
}: StopRowProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const nights = !rough ? nightsBetween(stop.arriveDate as string, stop.departDate as string) : 0;
  const hasCoords = stop.lat != null && stop.lng != null;
  const { t } = useMotionTiming();
  const openNights = stay ? stay.totalNights - stay.coveredNights : 0;
  const openNightsText = `${openNights} ${openNights === 1 ? "night" : "nights"} open`;

  // Spec 2026-10-05 §G: the whole header toggles — a pointer convenience;
  // the chevron stays the one accessible control. A press that began on a
  // control (the grip mid-drag, the ⋯ trigger) never toggles on release.
  const pressedControl = React.useRef(false);
  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as Element;
    pressedControl.current = !e.currentTarget.contains(target) || target.closest(OWN_CLICK) != null;
  }
  function onHeaderClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element;
    const pressed = pressedControl.current;
    pressedControl.current = false;
    // Portalled content (the ⋯ menu's items) bubbles through React, not the DOM.
    if (!e.currentTarget.contains(target)) return;
    if (pressed || target.closest(OWN_CLICK)) return;
    // Selecting the name to copy it isn't a click.
    if (window.getSelection()?.toString()) return;
    onToggle();
  }

  return (
    <article
      id={`stop-${stop.id}`}
      data-stop-id={stop.id}
      className={cn(
        "group/row relative flex-none scroll-mt-6 overflow-hidden rounded-[20px] border-2 border-border",
        rough ? "border-dashed bg-background" : "bg-card shadow-hard-4",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      <div
        data-testid="stop-row-header"
        onPointerDown={onHeaderPointerDown}
        onClick={onHeaderClick}
        className={cn(STOP_ROW_GRID, "cursor-pointer", dragHandle && "grid-cols-[auto_40px_minmax(0,1fr)_auto_auto]")}
      >
        {dragHandle}
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold text-on-accent",
            rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(stop.sortOrder)].fill,
          )}
        >
          {number}
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{stop.name}</h2>
            {stop.country && (
              <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">{stop.country}</span>
            )}
            {hasCoords && (
              <MapLink
                lat={stop.lat}
                lng={stop.lng}
                label={stop.country ? `${stop.name}, ${stop.country}` : stop.name}
                className="text-muted-foreground/60"
              />
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stay && stay.kind === "covered" && (
              <StayChip onOpen={onOpenStay} label={`Stay in ${stop.name}: ${stay.name}`} className={cn(CHIP, "bg-teal/15")}>
                <Check className="size-3.5" aria-hidden />
                {stay.name}
              </StayChip>
            )}
            {stay && stay.kind === "partial" && (
              <StayChip
                onOpen={onOpenStay}
                label={`Stay in ${stop.name}: ${stay.name}, ${openNightsText}`}
                className={cn(CHIP, "bg-sun/30")}
              >
                <Check className="size-3.5" aria-hidden />
                {stay.name} · {openNightsText}
              </StayChip>
            )}
            {stay && stay.kind === "none" && (
              <StayChip
                onOpen={onOpenStay}
                label={`No bed yet in ${stop.name} — add a stay`}
                className={cn(CHIP, "border-dashed bg-coral/20")}
              >
                No bed yet
              </StayChip>
            )}
            {plansCount > 0 && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"
              >
                {plansCount} {plansCount === 1 ? "plan" : "plans"}
              </span>
            )}
            {ideasCount > 0 && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"
              >
                {ideasCount} {ideasCount === 1 ? "idea" : "ideas"}
              </span>
            )}
          </div>

          {stop.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{stop.notes}</p>}
        </div>

        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
          {!rough ? (
            <>
              <span className="text-sm font-bold">
                {nights === 0 ? "Same day" : formatStayRange(stop.arriveDate as string, stop.departDate as string)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {tzAbbrev(stop.timezone, stop.arriveDate as string)}
                </span>
                {nights > 0 && (
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2 text-xs font-extrabold tabular-nums",
                      HUE_CLASSES[stopHue(stop.sortOrder)].fill,
                    )}
                  >
                    {formatNights(nights)}
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold">Rough</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border-2 border-dashed border-border bg-background px-2 text-xs font-extrabold tabular-nums">
                {formatNights(stop.nights ?? 1, { rough: true })}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <MoreActionsMenu
            label={`More actions for ${stop.name}`}
            groups={menuGroups}
            triggerClassName="tap-target size-9 rounded-[10px] border-2 border-border bg-card"
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? "Fold" : "Open"} ${stop.name}`}
            onClick={onToggle}
            className={cn(
              "tap-target pressable grid size-9 place-items-center rounded-[10px] border-2 border-border transition-colors duration-[var(--dur-fast)]",
              open ? "bg-sun" : "bg-card",
            )}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-[var(--dur-base)]", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* MOTION.md P2: height 0 ↔ auto, the content fading in 60ms after the
          height starts. Rows below ride the animated height. */}
      <AnimatePresence initial={false}>
        {open && (
          <PresenceDiv
            key="body"
            id={bodyId}
            data-motion="fold"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: t({ height: { duration: 0.32, ease: EASE_POP }, opacity: { delay: 0.06, duration: 0.18 } }),
            }}
            exit={{ height: 0, opacity: 0, transition: t({ duration: 0.2, ease: EASE_EXIT }, "exit") }}
            className="overflow-hidden"
          >
            {children}
          </PresenceDiv>
        )}
      </AnimatePresence>
    </article>
  );
}
