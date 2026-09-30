"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, useTransform } from "motion/react";
import { StatusPill } from "@/components/trips/status-pill";
import { NextStepChip } from "@/components/trips/next-step-chip";
import { Polaroid } from "@/components/trips/polaroid";
import { CoverStamp } from "@/components/trips/cover-stamp";
import { BigNumberBlock } from "@/components/trips/trip-card";
import { TripCardHeroView } from "@/components/trips/trip-card-hero";
import { useTween } from "@/components/money/use-tween";
import { cardBigNumber } from "@/lib/trips/trip-status";
import { formatDateRangeCompact, formatNights, nightsBetween } from "@/lib/dates";
import { previewModel, type PreviewInput, type PreviewModel } from "./preview-model";
import { cn } from "@/lib/cn";

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * The sleeps number (MOTION N7): 0 → value over 600ms on mount, then old → new
 * over 320ms. On a motion value, so counting doesn't re-render per frame.
 */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion() === true;
  // State, not a ref: it picks the duration during render. It isn't a tween dep,
  // so its flip just after mount doesn't restart the count.
  const [first, setFirst] = React.useState(true);
  React.useEffect(() => {
    if (first) void Promise.resolve().then(() => setFirst(false));
  }, [first]);
  const mv = useTween(value, { from: 0, duration: first ? 0.6 : 0.32, skip: reduce, ease: EASE_POP });
  const text = useTransform(mv, (v) => String(Math.round(v)));
  return <motion.span data-count-up className="tabular-nums">{text}</motion.span>;
}

function BottomContent({ bottom }: { bottom: PreviewModel["bottom"] }) {
  if (bottom.kind === "skeleton") {
    return (
      <div data-preview-skeleton className="flex flex-col gap-2">
        <span className="h-3.5 w-[120px] rounded-full bg-foreground/15" />
        <span className="h-3.5 w-[84px] rounded-full bg-foreground/15" />
      </div>
    );
  }
  if (bottom.kind === "rough") {
    return <BigNumberBlock big={{ value: bottom.month, unit: null, lead: "Sometime in" }} numberClass="" unitClass="" />;
  }
  return (
    <BigNumberBlock
      big={bottom.big}
      valueNode={<CountUp value={Number(bottom.big.value)} />}
      numberClass="text-[72px] leading-[0.85] tracking-[-0.06em] md:text-[84px]"
      // The label lands 100ms after the 600ms count (MOTION N7).
      unitClass="text-[18px] leading-[1.02] md:text-[22px] tp-fade-in [animation-delay:700ms] [animation-fill-mode:backwards] motion-reduce:[animation-delay:0s]"
    />
  );
}

function Bottom({ bottom }: { bottom: PreviewModel["bottom"] }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={bottom.kind} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
        <BottomContent bottom={bottom} />
      </motion.div>
    </AnimatePresence>
  );
}

function Cover({ m, coverUrl, size }: { m: PreviewModel; coverUrl?: string; size: "hero" | "small" }) {
  if (coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local object URL
    return <img src={coverUrl} alt="" className="size-full object-cover" />;
  }
  return <CoverStamp name={m.title} place={m.stamp.place} startDate={m.stamp.startDate} dateLabel={m.stamp.dateLabel} hue="coral" size={size} />;
}

/** The stamp: pops when its word changes (N5); a thunk key presses it like a rubber stamp (N6). */
function PreviewStamp({ m, thunkKey }: { m: PreviewModel; thunkKey?: number }) {
  return (
    <div key={`thunk-${thunkKey ?? 0}`} className={cn("size-full", thunkKey ? "tp-stamp-thunk" : undefined)}>
      <div key={m.stamp.place} data-stamp-pop className="size-full tp-pop">
        <Cover m={m} size="hero" />
      </div>
    </div>
  );
}

function Title({ m }: { m: PreviewModel }) {
  // No per-character motion: only the placeholder ↔ name swap cross-fades (MOTION N5).
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={m.placeholder ? "ph" : "name"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className={cn(m.placeholder && "text-foreground/40")}
      >
        {m.title}
      </motion.span>
    </AnimatePresence>
  );
}

/** Desktop preview column (NEW_TRIP.md §7): the real Trips hero, fed by the draft. */
export function TripPreview({ coverUrl, className, thunkKey, ...input }: PreviewInput & { coverUrl?: string; className?: string; thunkKey?: number }) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview" aria-hidden="true" inert className={cn("w-[420px] max-w-full origin-center md:scale-[0.85] xl:scale-100", className)}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">On your trips page</p>
      <div className="mt-3">
        <TripCardHeroView
          className="md:w-[420px] md:shadow-hard-4 md:group-data-[lifted]/lift:shadow-hard-5"
          pill={<StatusPill kind={m.pill.kind} label={m.pill.label} />}
          dateLine={m.dateLine ?? undefined}
          name={<Title m={m} />}
          big={<Bottom bottom={m.bottom} />}
          chip={m.chip ? <NextStepChip row={{ id: "preview-first-stop", title: "Add your first stop", href: "#", tone: "coral", icon: "map-pin" }} /> : null}
          cover={
            // Keyed so the wiggle replays with the stamp press (MOTION N6).
            <Polaroid key={`wiggle-${thunkKey ?? 0}`} size="hero" className={thunkKey ? "tp-wiggle" : undefined}>
              {/* Stamp ↔ photo cross-fade (MOTION N11). */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={coverUrl ?? "stamp"} className="size-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  {coverUrl ? <Cover m={m} coverUrl={coverUrl} size="hero" /> : <PreviewStamp m={m} thunkKey={thunkKey} />}
                </motion.div>
              </AnimatePresence>
            </Polaroid>
          }
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-on-accent-muted">{m.caption}</p>
    </div>
  );
}

/** Phones, step 1: a 250px tilted mini card (NEW_TRIP.md §7 "Mobile"). */
export function TripPreviewMini(input: PreviewInput) {
  const m = previewModel(input);
  return (
    <div data-testid="trip-preview-mini" aria-hidden="true" className="island mx-auto mt-8 flex w-[250px] -rotate-2 gap-3 rounded-[18px] border-2 border-border bg-coral p-3.5 shadow-hard-2 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusPill kind={m.pill.kind} label={m.pill.label} className="self-start" />
        <p className={cn("mt-2 font-display text-[20px] font-extrabold leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden", m.placeholder && "text-foreground/40")}>{m.title}</p>
      </div>
      <div className="w-[70px] shrink-0 rotate-[5deg] self-center rounded-[8px] border-2 border-border bg-card p-[4px] pb-[12px]">
        <div className="aspect-[3/4] overflow-hidden rounded-[3px] border-2 border-border">
          <Cover m={m} size="small" />
        </div>
      </div>
    </div>
  );
}

/** Phones, step 2: the coral countdown strip under the calendar. */
export function CountdownStrip({ startDate, endDate, today }: { startDate: string; endDate: string; today: string }) {
  const big = cardBigNumber({ kind: "up-next", startDate, endDate, today });
  return (
    <div data-testid="countdown-strip" className="island mt-3 flex items-center gap-3 rounded-2xl border-2 border-border bg-coral px-4 py-2.5 text-on-accent md:hidden">
      <span className="font-display text-4xl font-extrabold leading-none tabular-nums">{big.value}</span>
      {big.unit ? (
        <span className="flex flex-col text-[13px] font-extrabold leading-tight">
          <span>{big.unit[0]}</span>
          <span>{big.unit[1]}</span>
        </span>
      ) : null}
      <span className="ml-auto flex flex-col text-right text-[13px] font-extrabold leading-tight tabular-nums">
        <span>{formatDateRangeCompact(startDate, endDate)}</span>
        <span>{formatNights(nightsBetween(startDate, endDate))}</span>
      </span>
    </div>
  );
}
