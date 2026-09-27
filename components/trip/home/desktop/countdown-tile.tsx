import Link from "next/link";
import { cn } from "@/lib/cn";
import { countdownLabel, type Countdown } from "@/lib/countdown";
import { Card } from "@/components/ui/card";
import { CountdownPolaroid, AddCoverPhotoButton } from "@/components/trip/home/desktop/countdown-polaroid";

export interface CountdownTileProps {
  href: string;
  status: "PLANNING" | "TRAVELLING" | "HOME";
  countdown: Countdown;
  /** "Fri 4 Dec · Sydney → Denpasar, Bali" (firstLegLine) — or today's Stop while travelling. */
  firstLeg: string | null;
  cover: {
    url: string;
    /** Trip.coverAspect (width/height). */
    aspect: number | null;
    /** Trip.coverImageKey — cache-busts the uploader's preview. */
    version?: string | null;
    focalX?: number | null;
    focalY?: number | null;
  } | null;
  tripId: string;
}

/** The big number (or word) and its stacked two-line unit. */
function countdownParts(c: Countdown): { value: string; unit: [string, string] | null } {
  switch (c.kind) {
    case "sleeps":
      return { value: String(c.n), unit: [c.unit, "to go"] };
    case "day":
      return { value: String(c.n), unit: [`of ${c.of}`, "days"] };
    case "today":
      return { value: "Today", unit: null };
    case "home":
      return { value: "Back home", unit: null };
    case "no-dates":
      return { value: "Pick your dates", unit: null };
  }
}

/**
 * Desktop Home countdown tile (spec 2026-09-27-desktop-home §4). Coral card;
 * the whole tile links to the Plan — a stretched link underneath the content,
 * so the polaroid's "Change" / "+ Add a photo" buttons can sit on top of it
 * without nesting interactive elements. The number reads as one phrase
 * ("68 sleeps to go"). Dates and currency live only in the page header.
 */
export function CountdownTile({ href, status, countdown, firstLeg, cover, tripId }: CountdownTileProps) {
  const label = countdownLabel(countdown);
  const { value, unit } = countdownParts(countdown);
  const hasPhoto = cover != null;
  const isWord = unit === null;

  const chip = (
    <span className="self-start rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
      {status}
    </span>
  );

  const numberRow = (
    <div
      role="img"
      aria-label={label}
      className={cn("flex items-baseline", hasPhoto ? "gap-3" : "gap-2.5")}
    >
      <span
        className={cn(
          "font-display font-extrabold",
          isWord
            ? cn("leading-[0.95] tracking-[-0.04em]", hasPhoto ? "text-[64px]" : "text-[48px]")
            : cn("leading-[0.85] tracking-[-0.06em]", hasPhoto ? "text-[132px]" : "text-[96px]"),
        )}
      >
        {value}
      </span>
      {unit ? (
        <span
          className={cn(
            "flex flex-col font-display font-extrabold leading-[1.02]",
            hasPhoto ? "text-[32px]" : "text-[26px]",
          )}
        >
          <span>{unit[0]}</span>
          <span>{unit[1]}</span>
        </span>
      ) : null}
    </div>
  );

  const legLine = firstLeg ? (
    <p className={cn("font-semibold", hasPhoto ? "mt-4 text-[15px]" : "mt-3 text-sm")}>{firstLeg}</p>
  ) : null;

  return (
    <Card
      tone="coral"
      radius="xl"
      shadow={3}
      className="relative flex h-full min-h-0 overflow-hidden text-on-accent"
    >
      <h2 className="sr-only">Countdown</h2>
      <Link
        href={href}
        aria-label={`${label}. Open the Plan`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-[3px] focus-visible:-outline-offset-4 focus-visible:outline-ring"
      />
      {hasPhoto ? (
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 gap-6 p-6">
          <div className="flex min-w-0 flex-1 flex-col">
            {chip}
            <div className="mt-auto">
              {numberRow}
              {legLine}
            </div>
          </div>
          <CountdownPolaroid
            tripId={tripId}
            url={cover.url}
            aspect={cover.aspect}
            version={cover.version}
            focalX={cover.focalX}
            focalY={cover.focalY}
          />
        </div>
      ) : (
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col px-6 py-[22px]">
          <div className="flex items-start justify-between gap-3">
            {chip}
            <AddCoverPhotoButton tripId={tripId} />
          </div>
          <div className="mt-auto">
            {numberRow}
            {legLine}
          </div>
        </div>
      )}
    </Card>
  );
}
