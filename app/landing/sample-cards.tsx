"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Cloud, RefreshCw, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, cardVariants } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { SampleTrip } from "./sample-trips";
import { useTripShuffle, PHONE_TIMING } from "./use-trip-shuffle";

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

/**
 * The desktop collage (spec 2026-09-29 collage §1.3): nine pieces scattered
 * over the sun panel, designed on a 560×720 canvas centred in the panel and
 * scaled per breakpoint. Pieces may run off the panel's edges (it clips) —
 * except the coral countdown, which stays whole near the middle. Delays are
 * deliberately uneven so the cards land like they were tossed, not dealt.
 */
export function CollageCards() {
  return (
    <div
      aria-hidden="true"
      data-testid="collage-cards"
      className="absolute left-1/2 top-1/2 h-[720px] w-[560px] -translate-x-1/2 -translate-y-1/2 scale-[.9] min-[1152px]:scale-[.95] min-[1280px]:scale-100 min-[1536px]:scale-110 min-[1920px]:scale-[1.3] min-[2560px]:scale-[1.75]"
    >
      {/* 9 · stops strip — runs off the top */}
      <Card data-piece="stops" shadow={2} radius="xl" className="tp-card-in absolute -top-6 left-[60px] flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold" style={entrance(-2, 8, 1370)}>
        {["Tokyo", "Hakone", "Kyoto", "Osaka"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="size-2 rounded-full bg-coral" />{s}
          </span>
        ))}
      </Card>
      {/* 5 · day plan */}
      <Card data-piece="day" shadow={3} radius="xl" className="tp-card-in absolute left-[-40px] top-[70px] w-[230px] p-4" style={entrance(-3, 4, 740)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Tue 14 Oct</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold">
          <li><span className="tabular-nums text-muted-foreground">09:00</span> Fushimi Inari</li>
          <li><span className="tabular-nums text-muted-foreground">12:30</span> Nishiki lunch</li>
          <li><span className="tabular-nums text-muted-foreground">19:00</span> Pontochō</li>
        </ul>
      </Card>
      {/* 6 · weather — runs off the right */}
      <Card data-piece="weather" tone="teal" shadow={2} radius="xl" className="tp-card-in absolute right-[-50px] top-[110px] w-[170px] p-4" style={entrance(5, 5, 1050)}>
        <p className="text-[11px] font-bold">Kyoto</p>
        <p className="font-display text-[40px] font-extrabold leading-none tracking-[-0.04em]">21° ☀</p>
        <p className="mt-1 text-[12px] font-medium">light jacket tonight</p>
      </Card>
      {/* 1 · coral countdown — always whole, near centre */}
      <Card data-piece="countdown" tone="coral" shadow={4} radius="xl" className="tp-card-in absolute left-[110px] top-[230px] w-[300px] p-5" style={entrance(-5, 0, 300)}>
        <Badge caps>Planning</Badge>
        <p className="mt-3 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em]">Japan in Autumn</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[76px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[22px] font-extrabold leading-[1.2]">sleeps<br />to go</span>
        </div>
      </Card>
      {/* 2 · lilac stay */}
      <Card data-piece="lilac" tone="lilac" shadow={2} className="tp-card-in absolute right-[-10px] top-[330px] w-[230px] p-4" style={entrance(3, 1, 520)}>
        <p className="text-[11px] font-bold leading-[1.2]">Kyoto · 4 nights</p>
        <p className="mt-1.5 font-display text-lg font-extrabold leading-[1.2]">Zz Machiya near Gion</p>
        <Badge variant="teal" className="mt-2.5">paid ✓</Badge>
      </Card>
      {/* 3 · sun chip */}
      <Badge data-piece="train" variant="sun" className="tp-card-in absolute left-[150px] top-[478px] px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-7, 2, 610)}>
        → Shinkansen · Odawara 11:12
      </Badge>
      {/* 8 · wishlist */}
      <Card data-piece="wishlist" tone="lilac" shadow={2} radius="xl" className="tp-card-in absolute left-[-30px] top-[540px] w-[200px] p-4" style={entrance(4, 7, 960)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]">Wishlist</p>
        <p className="mt-1 font-display text-lg font-extrabold leading-tight">Naoshima art island</p>
        <Badge className="mt-2">♡ 2</Badge>
      </Card>
      {/* 4 · teal fork */}
      <Card data-piece="fork" tone="teal" className="tp-card-in absolute left-[250px] top-[540px] w-[150px] p-3.5" style={entrance(6, 3, 880)}>
        <div className="flex gap-1.5">
          <Initials initials="JM" tone="sun" />
          <Initials initials="AL" tone="lilac" />
        </div>
        <p className="mt-2 text-[13px] font-medium leading-snug">Jess forked<br />&ldquo;Slow Kyoto&rdquo;</p>
      </Card>
      {/* 7 · money — runs off the bottom */}
      <Card data-piece="money" shadow={3} radius="xl" className="tp-card-in absolute bottom-[-40px] right-[10px] w-[210px] p-4" style={entrance(-4, 6, 1180)}>
        <p className="text-[12px] font-bold">Ramen at Ichiran</p>
        <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">¥2,400</p>
        <Badge variant="sun" className="mt-2">Jess owes you ¥1,200</Badge>
      </Card>
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
