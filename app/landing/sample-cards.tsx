import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * The tilted sample cards on the Landing (spec 2026-09-29 §1.1 desktop,
 * §1.2 phone), straight from the kit's DLanding.jsx / Landing.jsx.
 * Decoration only: aria-hidden, and nothing inside is focusable — chips are
 * <Badge> (a span), never <Chip> (a button). Each piece carries the entrance
 * class with its rest tilt and stagger index (§1.4); Tailwind rotate-*
 * utilities are deliberately absent (they would double the rotation).
 */
export function entrance(tilt: number, i: number): CSSProperties {
  return { "--tp-tilt": `${tilt}deg`, "--tp-i": i } as CSSProperties;
}

function Initials({ initials, tone }: { initials: string; tone: "sun" | "lilac" }) {
  return (
    <Avatar className="size-[26px]">
      <AvatarFallback className={tone === "sun" ? "bg-sun text-[10px]" : "bg-lilac text-[10px]"}>{initials}</AvatarFallback>
    </Avatar>
  );
}

export function DesktopSampleCards() {
  return (
    <div
      aria-hidden="true"
      data-testid="sample-cards-desktop"
      className="absolute bottom-[-30px] left-12 h-[260px] w-[744px] origin-bottom-left lg:scale-[.66] min-[1152px]:scale-[.82] min-[1280px]:scale-100"
    >
      <Card tone="coral" shadow={4} radius="xl" className="tp-card-in absolute bottom-10 left-0 w-[300px] p-5" style={entrance(-5, 0)}>
        <Badge caps>Planning</Badge>
        <p className="mt-3 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em]">Japan in Autumn</p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[76px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[22px] font-extrabold leading-[1.2]">sleeps<br />to go</span>
        </div>
      </Card>
      <Card tone="lilac" shadow={2} className="tp-card-in absolute bottom-[90px] left-[330px] w-[250px] p-4" style={entrance(3, 1)}>
        <p className="text-[11px] font-bold leading-[1.2]">Kyoto · 4 nights</p>
        <p className="mt-1.5 font-display text-lg font-extrabold leading-[1.2]">Zz Machiya near Gion</p>
        <Badge variant="teal" className="mt-2.5">paid ✓</Badge>
      </Card>
      <Badge variant="sun" className="tp-card-in absolute bottom-[30px] left-[360px] px-3.5 py-2 text-xs shadow-hard-2" style={entrance(-7, 2)}>
        → Shinkansen · Odawara 11:12
      </Badge>
      <Card tone="teal" className="tp-card-in absolute bottom-[70px] left-[620px] w-[150px] p-3.5" style={entrance(6, 3)}>
        <div className="flex gap-1.5">
          <Initials initials="JM" tone="sun" />
          <Initials initials="AL" tone="lilac" />
        </div>
        <p className="mt-2 text-[13px] font-medium leading-snug">Jess forked<br />&ldquo;Slow Kyoto&rdquo;</p>
      </Card>
    </div>
  );
}

export function PhoneSampleCards() {
  return (
    <div aria-hidden="true" data-testid="sample-cards-phone" className="relative mt-[22px] h-[210px]">
      <Card tone="coral" shadow={3} radius="xl" className="tp-card-in absolute left-0 top-0 w-[210px] p-4" style={entrance(-4, 0)}>
        <Badge caps>Planning</Badge>
        <p className="mt-2.5 font-display text-[20px] font-extrabold leading-[1.2]">Japan in Autumn</p>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[56px] font-extrabold leading-[0.9] tracking-[-0.05em]">26</span>
          <span className="font-display text-[15px] font-extrabold leading-[1.2]">sleeps<br />to go</span>
        </div>
      </Card>
      <Card tone="lilac" className="tp-card-in absolute right-0 top-24 w-[140px] p-3" style={entrance(5, 1)}>
        <Badge>Zz Machiya Gion ✓</Badge>
        <p className="mt-2 text-[13px] font-medium">Kyoto · 4 nights</p>
      </Card>
      <Badge variant="sun" className="tp-card-in absolute left-[120px] top-[150px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(-8, 2)}>
        → Shinkansen · 11:12
      </Badge>
      <Badge variant="teal" className="tp-card-in absolute right-5 top-[170px] px-2.5 py-1 text-[11px] shadow-hard-1" style={entrance(6, 3)}>
        let&apos;s go
      </Badge>
    </div>
  );
}
