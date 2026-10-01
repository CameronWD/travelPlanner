"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Check, Cloud, Heart, RefreshCw, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, cardVariants } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { SampleTrip } from "./sample-trips";
import { useTripShuffle, PHONE_TIMING, DESKTOP_TIMING } from "./use-trip-shuffle";

/**
 * The Landing's card fan (handoff design_handoff/landing-shuffle-handoff/
 * LANDING.md; spec 2026-10-01 §A): a centred, mirrored group of tilted sample
 * cards that shuffles between four sample trips, with a route ribbon
 * underneath — the one piece that bleeds off the edges. Every piece is a
 * positioned *wrapper* (what the shuffle animates) around a *card* carrying
 * tp-card-in and its tilt (§5.1); Tailwind rotate-* utilities are
 * deliberately absent (they would double the rotation).
 *
 * Accessibility (§6): neither container is aria-hidden — that would hide the
 * one button. Each decorative wrapper is aria-hidden; the coral front card is
 * a <button aria-label="Show another sample trip"> with its visible content
 * aria-hidden. No live region: the cards are illustrative.
 */
export function entrance(tilt: number, i: number, delayMs?: number): CSSProperties {
  return {
    "--tp-tilt": `${tilt}deg`,
    "--tp-i": i,
    ...(delayMs === undefined ? {} : { "--tp-delay": `${delayMs}ms` }),
  } as CSSProperties;
}

function Initials({ initials, tone }: { initials: string; tone: "sun" | "lilac" }) {
  return (
    <Avatar className="size-[26px]">
      <AvatarFallback className={tone === "sun" ? "bg-sun text-[10px]" : "bg-lilac text-[10px]"}>{initials}</AvatarFallback>
    </Avatar>
  );
}

/** The route ribbon (§2.3): two identical halves on a -50% marquee, so the loop has no seam. */
function Ribbon({ stops, repeats, size, i, delayMs }: { stops: readonly string[]; repeats: 2 | 3; size: "phone" | "desktop"; i: number; delayMs: number }) {
  const phone = size === "phone";
  const items = Array.from({ length: repeats }, () => stops).flat();
  return (
    <div
      className={cn(
        "tp-card-in overflow-hidden border-y-2 border-border bg-card",
        phone ? "py-2.5 shadow-[0_3px_0_hsl(var(--shadow-ink))]" : "py-3 shadow-[0_4px_0_hsl(var(--shadow-ink))]",
      )}
      style={entrance(0, i, delayMs)}
    >
      <div className={cn("tp-marquee flex w-max", phone ? "[--tp-marquee-dur:22s]" : "[--tp-marquee-dur:30s]")}>
        {[0, 1].map((half) => (
          <div
            key={half}
            data-ribbon-half=""
            className={cn("flex items-center whitespace-nowrap font-bold", phone ? "gap-2.5 pr-2.5 text-[13px]" : "gap-3 pr-3 text-[15px]")}
          >
            {items.map((stop, k) => (
              <span key={k} className="flex items-center gap-2">
                <span className={cn("rounded-full bg-coral", phone ? "size-2" : "size-[9px]")} />
                {stop}
                <ArrowRight className="size-3 text-muted-foreground" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The coral front card — the only focusable thing in the fan (§6). Untilted, so hover and press are free to use `pressable`. */
function FrontCard({ trip, size, onShuffle }: { trip: SampleTrip; size: "phone" | "desktop"; onShuffle: () => void }) {
  const phone = size === "phone";
  return (
    <button
      type="button"
      aria-label="Show another sample trip"
      onClick={onShuffle}
      className={cn(
        cardVariants({ tone: "coral", shadow: phone ? 2 : 4, radius: "xl" }),
        "tp-card-in pressable flex w-full flex-col items-center text-center",
        phone ? "p-4" : "p-5",
      )}
      style={entrance(0, 0, 300)}
    >
      <span aria-hidden="true" className="contents">
        <RefreshCw className={phone ? "absolute right-3 top-2.5 size-3.5" : "absolute right-4 top-3.5 size-4"} />
        <Badge caps>{trip.status}</Badge>
        <span className={cn("whitespace-nowrap font-display font-extrabold", phone ? "mt-2.5 text-[18px] leading-[1.2]" : "mt-3 text-[24px] leading-[1.1] tracking-[-0.03em]")}>
          {trip.name}
        </span>
        <span className={cn("flex items-baseline", phone ? "gap-1.5" : "gap-2")}>
          <span className={cn("font-display font-extrabold leading-[0.9] tracking-[-0.05em]", phone ? "text-[56px]" : "text-[76px]")}>{trip.big}</span>
          <span className={cn("text-left font-display font-extrabold leading-[1.2]", phone ? "text-[15px]" : "text-[20px]")}>
            {trip.small[0]}
            <br />
            {trip.small[1]}
          </span>
        </span>
      </span>
    </button>
  );
}

export const DESKTOP_PIECE_ORDER = ["countdown", "lilac", "weather", "day", "money", "fork", "wishlist", "train", "stops"] as const;

/**
 * Desktop fan (§3): nine pieces in three mirrored rows on a 600×630 stage
 * centred in the sun panel and scaled per breakpoint. Top row day / money,
 * middle row lilac / coral / teal, bottom row teal / lilac (the colours cross
 * over), the sun chip across the middle seam and the ribbon across the
 * bottom — the only piece that runs off the panel.
 */
export function CollageCards() {
  const { trip, pieceRef, shuffle } = useTripShuffle(DESKTOP_PIECE_ORDER, DESKTOP_TIMING);
  const Sky = trip.sky === "sun" ? Sun : Cloud;
  return (
    <div
      data-testid="collage-cards"
      className="absolute left-1/2 top-1/2 h-[630px] w-[600px] -translate-x-1/2 -translate-y-1/2 scale-[.9] min-[1152px]:scale-[.95] min-[1280px]:scale-100 min-[1536px]:scale-110 min-[1920px]:scale-[1.3] min-[2560px]:scale-[1.75]"
    >
      <div ref={pieceRef("day")} data-piece="day" aria-hidden="true" className="absolute left-10 top-[18px] w-[210px]">
        <Card shadow={3} radius="xl" className="tp-card-in p-4" style={entrance(-8, 3, 740)}>
          <p className="text-label text-muted-foreground">{trip.date}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold">
            {trip.plan.map((row) => (
              <li key={row.time} className="truncate">
                <span className="tabular-nums text-muted-foreground">{row.time}</span> {row.what}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div ref={pieceRef("money")} data-piece="money" aria-hidden="true" className="absolute right-10 top-[18px] w-[210px]">
        <Card shadow={3} radius="xl" className="tp-card-in flex flex-col items-end p-4 text-right" style={entrance(8, 7, 1180)}>
          <p className="whitespace-nowrap text-[12px] font-bold">{trip.spend}</p>
          <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{trip.amount}</p>
          <Badge variant="sun" className="mt-2">{trip.owes}</Badge>
        </Card>
      </div>
      <div ref={pieceRef("lilac")} data-piece="lilac" aria-hidden="true" className="absolute left-3 top-[196px] w-[170px]">
        <Card tone="lilac" shadow={2} className="tp-card-in p-4" style={entrance(-5, 1, 520)}>
          <p className="text-[11px] font-bold leading-[1.2]">{trip.place}</p>
          <p className="mt-1.5 font-display text-lg font-extrabold leading-[1.2]">{trip.bed}</p>
          <Badge variant="teal" className="mt-2.5">
            paid
            <Check />
          </Badge>
          <div className="h-[18px]" />
        </Card>
      </div>
      <div ref={pieceRef("weather")} data-piece="weather" aria-hidden="true" className="absolute right-3 top-[196px] w-[170px]">
        <Card tone="teal" shadow={2} radius="xl" className="tp-card-in p-4 text-right" style={entrance(5, 6, 1050)}>
          <p className="text-[11px] font-bold">{trip.city}</p>
          <p className="flex items-center justify-end gap-1.5 font-display text-[40px] font-extrabold leading-none tracking-[-0.04em]">
            {trip.temp}
            <Sky className="size-7" />
          </p>
          <p className="mt-1 text-[12px] font-medium">{trip.wear}</p>
          <div className="h-[30px]" />
        </Card>
      </div>
      <div ref={pieceRef("countdown")} data-piece="countdown" className="absolute left-[170px] top-[150px] z-20 w-[260px]">
        <FrontCard trip={trip} size="desktop" onShuffle={() => void shuffle()} />
      </div>
      <div ref={pieceRef("train")} data-piece="train" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[360px] z-30 flex justify-center">
        <Badge variant="sun" className="tp-card-in px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-4, 2, 610)}>
          <ArrowRight />
          {trip.leg}
        </Badge>
      </div>
      <div ref={pieceRef("fork")} data-piece="fork" aria-hidden="true" className="absolute left-[70px] top-[418px] w-[180px]">
        <Card tone="teal" shadow={2} className="tp-card-in p-3.5" style={entrance(6, 4, 880)}>
          <div className="flex gap-1.5">
            <Initials initials={trip.who[0]} tone="sun" />
            <Initials initials={trip.who[1]} tone="lilac" />
          </div>
          <p className="mt-2 text-[13px] font-medium leading-snug">
            {trip.note[0]}
            <br />
            {trip.note[1]}
          </p>
        </Card>
      </div>
      <div ref={pieceRef("wishlist")} data-piece="wishlist" aria-hidden="true" className="absolute right-[70px] top-[418px] w-[190px]">
        <Card tone="lilac" shadow={2} radius="xl" className="tp-card-in p-4" style={entrance(-6, 5, 960)}>
          <p className="text-label">Wishlist</p>
          <p className="mt-1 font-display text-lg font-extrabold leading-tight">{trip.wish}</p>
          <Badge className="mt-2">
            <Heart />
            {trip.hearts}
          </Badge>
        </Card>
      </div>
      <div ref={pieceRef("stops")} data-piece="stops" aria-hidden="true" className="absolute -inset-x-10 top-[574px]">
        <Ribbon stops={trip.stops} repeats={3} size="desktop" i={8} delayMs={1370} />
      </div>
    </div>
  );
}

export const PHONE_PIECE_ORDER = ["countdown", "lilac", "weather", "train", "stops"] as const;

/**
 * Phone fan (§2.2): five pieces on a 393×268 stage centred in whatever is
 * left under the buttons. Side cards 116px (104px under 380px wide), the
 * front card 180px (168px), the sun chip across the seam, the ribbon as the
 * one bleed. Delays are deliberately uneven so the cards land like they were
 * tossed, not dealt.
 */
export function PhoneSampleCards() {
  const { trip, pieceRef, shuffle } = useTripShuffle(PHONE_PIECE_ORDER, PHONE_TIMING);
  const Sky = trip.sky === "sun" ? Sun : Cloud;
  return (
    <div
      data-testid="sample-cards-phone"
      className="relative -mx-6 flex min-h-0 flex-1 items-center justify-center self-stretch overflow-hidden text-left"
    >
      <div className="relative h-[268px] w-full max-w-[393px] shrink-0">
        <div ref={pieceRef("lilac")} data-piece="lilac" aria-hidden="true" className="absolute left-3.5 top-[34px] w-[116px] max-[379px]:w-[104px]">
          <Card tone="lilac" shadow={1} className="tp-card-in p-3" style={entrance(-7, 1, 520)}>
            <p className="text-[11px] font-bold leading-[1.2]">{trip.place}</p>
            <p className="mt-1 font-display text-[15px] font-extrabold leading-[1.2]">{trip.bed}</p>
            <div className="h-10" />
          </Card>
        </div>
        <div ref={pieceRef("weather")} data-piece="weather" aria-hidden="true" className="absolute right-3.5 top-[34px] w-[116px] max-[379px]:w-[104px]">
          <Card tone="teal" shadow={1} className="tp-card-in p-3 text-right" style={entrance(7, 2, 700)}>
            <p className="text-[10px] font-bold">{trip.city}</p>
            <p className="flex items-center justify-end gap-1 font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">
              {trip.temp}
              <Sky className="size-[18px]" />
            </p>
            <p className="mt-1 text-[11px] font-medium">{trip.wear}</p>
            <div className="h-[26px]" />
          </Card>
        </div>
        <div ref={pieceRef("countdown")} data-piece="countdown" className="absolute left-1/2 top-2.5 z-20 -ml-[90px] w-[180px] max-[379px]:-ml-[84px] max-[379px]:w-[168px]">
          <FrontCard trip={trip} size="phone" onShuffle={() => void shuffle()} />
        </div>
        <div ref={pieceRef("train")} data-piece="train" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[166px] z-30 flex justify-center">
          <Badge variant="sun" className="tp-card-in px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-4, 3, 610)}>
            <ArrowRight />
            {trip.leg}
          </Badge>
        </div>
        <div ref={pieceRef("stops")} data-piece="stops" aria-hidden="true" className="absolute -inset-x-3 top-[216px]">
          <Ribbon stops={trip.stops} repeats={2} size="phone" i={4} delayMs={880} />
        </div>
      </div>
    </div>
  );
}
