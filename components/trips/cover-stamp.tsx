import type { Hue } from "@/lib/hues";
import { cn } from "@/lib/cn";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "04 DEC 26" from YYYY-MM-DD. */
export function stampDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

/** Initials of a multi-word name ("New Zealand" → "NZ"), else the first 8 letters. */
function abbreviate(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  return name.slice(0, 8);
}

/** TRIP_COVER.md §4 "Which place to show". */
export function stampPlace({ stops, name, size }: { stops: { name: string }[]; name: string; size: "hero" | "small" }): string {
  if (stops.length === 1) return stops[0].name;
  if (size === "small" && name.length > 8) return abbreviate(name);
  return name;
}

const INK: Record<Hue, string> = {
  sky: "text-hue-sky-ink border-hue-sky-ink", sun: "text-hue-sun-ink border-hue-sun-ink", leaf: "text-hue-leaf-ink border-hue-leaf-ink",
  lilac: "text-hue-lilac-ink border-hue-lilac-ink", pink: "text-hue-pink-ink border-hue-pink-ink", teal: "text-hue-teal-ink border-hue-teal-ink",
  coral: "text-hue-coral-ink border-hue-coral-ink", indigo: "text-hue-indigo-ink border-hue-indigo-ink", stone: "text-hue-stone-ink border-hue-stone-ink",
};

export interface CoverStampProps {
  name: string;
  place: string;
  startDate: string | null;
  hue: Hue;
  size: "hero" | "small";
}

/** Passport stamp: paper inner box, ringed circle in the Trip colour's ink shade. aria-hidden. */
export function CoverStamp({ place, startDate, hue, size }: CoverStampProps) {
  const ink = INK[hue];
  const hero = size === "hero";
  return (
    <div aria-hidden="true" className="flex size-full items-center justify-center bg-background">
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-full border-solid text-center",
          ink,
          hero ? "size-[108px] -rotate-[14deg] border-[3px]" : "size-[64px] rotate-[10deg] border-[2.5px]",
        )}
      >
        <div className={cn("flex size-full flex-col items-center justify-center rounded-full", hero && "m-[6px] border-[1.5px] border-solid", ink, hero && "size-[calc(100%-12px)]")}>
          {hero ? (
            <span className="text-[9px] font-extrabold tracking-[0.14em]">{startDate ? "★ ARRIVED ★" : "★ SOMEDAY ★"}</span>
          ) : null}
          <span
            className={cn(
              "font-display font-extrabold uppercase leading-none",
              hero ? "my-[3px] max-w-[88px] text-[22px] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden" : "text-[13px]",
            )}
          >
            {place}
          </span>
          {startDate ? (
            <span
              className={cn(
                "font-extrabold tracking-[0.1em]",
                hero ? "border-y-[1.5px] border-solid px-1 py-[2px] text-[10px]" : "text-[7px]",
                ink,
              )}
            >
              {stampDate(startDate)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
