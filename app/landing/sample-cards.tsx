import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * The tilted sample cards on the Landing (spec 2026-09-29 collage §1.3
 * desktop, §1.4 phone). Decoration only: aria-hidden, and nothing inside is
 * focusable — chips are <Badge> (a span), never <Chip> (a button). Each
 * piece carries the entrance class with its rest tilt and stagger index
 * (§1.4); Tailwind rotate-* utilities are deliberately absent (they would
 * double the rotation).
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
          <span className="font-display text-[22px] font-extrabold leading-[1.2]">nights<br />to go</span>
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

/**
 * Phone card set (spec collage §1.4; one-landing Task 3): fills the screen
 * below the buttons and is clipped there. Coral and the train chip are
 * pixel-anchored near the top-left (small, fixed offsets so they read the
 * same at every phone height); the other eight pieces are a staggered spread
 * that alternates right / left all the way down — lilac beside coral, then
 * weather, the stops strip across the middle (running off the left edge),
 * day plan and wishlist, the "let's go" chip, and the teal fork and money
 * spilling off the bottom edge — using height-relative offsets (`top-[N%]`,
 * `top-[calc(100%-Npx)]`) so neither half of the area is left with an empty
 * band, on a short 360×640 screen and a tall 430×932 one alike. The
 * `max(…, Npx)` floors push lower pieces below coral on a short screen, where
 * they fall out of (or are clipped by) the area instead of piling onto the
 * top pieces' text. `npm run audit:landing-cards` checks the coverage.
 */
export function PhoneSampleCards() {
  return (
    <div aria-hidden="true" data-testid="sample-cards-phone" className="relative -mx-6 mt-6 min-h-0 flex-1 overflow-hidden">
      {/* coral + train: fixed near the top, always whole/readable (z above
          the spread below, which overlaps more the shorter the screen is) */}
      <Card data-piece="countdown" tone="coral" shadow={3} radius="xl" className="tp-card-in absolute left-6 top-3 z-20 w-[210px] p-4" style={entrance(-4, 0, 300)}>
        <Badge caps>Planning</Badge>
        <p className="mt-2.5 font-display text-[20px] font-extrabold leading-[1.2]">Japan in Autumn</p>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[15px] font-extrabold leading-[1.2]">nights<br />to go</span>
        </div>
      </Card>
      <Badge data-piece="train" variant="sun" className="tp-card-in absolute left-[140px] top-[160px] z-10 px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-8, 1, 610)}>
        → Shinkansen · 11:12
      </Badge>
      {/* the spread: alternating right/left, height-relative so it stretches
          with the clipped area's own height; z-0 (a shared tie) so overlaps
          at 360×640 stack in DOM/visual order. */}
      <Card data-piece="lilac" tone="lilac" className="tp-card-in absolute right-[-6px] top-4 z-0 w-[140px] p-3" style={entrance(5, 2, 520)}>
        <Badge>Zz Machiya Gion ✓</Badge>
        <p className="mt-2 text-[13px] font-medium">Kyoto · 4 nights</p>
      </Card>
      <Card data-piece="weather" tone="teal" shadow={2} radius="xl" className="tp-card-in absolute right-[-14px] top-[29%] z-0 w-[125px] p-3" style={entrance(4, 3, 700)}>
        <p className="text-[10px] font-bold">Kyoto</p>
        <p className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">21° ☀</p>
        <p className="mt-1 text-[11px] font-medium">light jacket tonight</p>
      </Card>
      <Card data-piece="stops" shadow={2} radius="xl" className="tp-card-in absolute left-[-32px] top-[max(38%,196px)] z-0 flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold" style={entrance(-2, 4, 880)}>
        {["Tokyo", "Hakone", "Kyoto", "Osaka"].map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span className="size-2 rounded-full bg-coral" />{s}
          </span>
        ))}
      </Card>
      <Card data-piece="day" shadow={2} radius="xl" className="tp-card-in absolute left-[-10px] top-[max(50%,232px)] z-0 w-[190px] p-3.5" style={entrance(3, 5, 800)}>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Tue 14 Oct</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-[12px] font-semibold">
          <li><span className="tabular-nums text-muted-foreground">09:00</span> Fushimi Inari</li>
          <li><span className="tabular-nums text-muted-foreground">12:30</span> Nishiki lunch</li>
          <li><span className="tabular-nums text-muted-foreground">19:00</span> Pontochō</li>
        </ul>
      </Card>
      <Card data-piece="wishlist" tone="lilac" shadow={2} radius="xl" className="tp-card-in absolute right-[-18px] top-[max(56%,290px)] z-0 w-[150px] p-3" style={entrance(-6, 6, 1040)}>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em]">Wishlist</p>
        <p className="mt-1 font-display text-[15px] font-extrabold leading-tight">Naoshima art island</p>
        <Badge className="mt-1.5 text-[10px]">♡ 2</Badge>
      </Card>
      <Badge data-piece="go" variant="teal" className="tp-card-in absolute left-[40px] top-[max(72%,276px)] z-0 px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(6, 7, 960)}>
        let&apos;s go
      </Badge>
      <Card data-piece="fork" tone="teal" className="tp-card-in absolute left-[-12px] top-[max(calc(100%-80px),300px)] z-0 w-[150px] p-3" style={entrance(6, 9, 1270)}>
        <div className="flex gap-1.5">
          <Initials initials="JM" tone="sun" />
          <Initials initials="AL" tone="lilac" />
        </div>
        <p className="mt-2 text-[12px] font-medium leading-snug">Jess forked<br />&ldquo;Slow Kyoto&rdquo;</p>
      </Card>
      <Card data-piece="money" shadow={3} radius="xl" className="tp-card-in absolute right-[-20px] top-[max(calc(100%-95px),242px)] z-0 w-[170px] p-3.5" style={entrance(-5, 8, 1120)}>
        <p className="text-[11px] font-bold">Ramen at Ichiran</p>
        <p className="font-display text-[26px] font-extrabold leading-none tracking-[-0.04em]">¥2,400</p>
        <Badge variant="sun" className="mt-1.5 text-[10px]">Jess owes you ¥1,200</Badge>
      </Card>
    </div>
  );
}
