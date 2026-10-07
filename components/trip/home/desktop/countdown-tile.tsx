import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { countdownLabel, type Countdown } from "@/lib/countdown";
import type { HomeStat } from "@/lib/home-stats";
import { Card } from "@/components/ui/card";
import { CountdownPolaroid, AddCoverPhotoButton } from "@/components/trip/home/desktop/countdown-polaroid";

export interface CountdownTileProps {
  href: Route;
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
  /** The "at a glance" stats (nights, Stops, countries, Chapters) — a row under the chip, or a column beside the number with a photo; omitted when empty. */
  stats?: HomeStat[];
}

/** The big number (or word) and its stacked two-line unit. */
function countdownParts(c: Countdown): { value: string; unit: [string, string] | null; lead?: string } {
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
    case "rough-month":
      return { value: c.month, unit: null, lead: "Sometime in" };
  }
}

/**
 * Desktop Home countdown tile (spec 2026-09-27-desktop-home §4). Coral card;
 * the whole tile links to the Plan — a stretched link underneath the content,
 * so the polaroid's "Change" / "+ Add a photo" buttons can sit on top of it
 * without nesting interactive elements. The number reads as one phrase
 * ("68 sleeps to go"). Dates and currency live only in the page header;
 * nights, Stops, countries and Chapters are the at-a-glance row here.
 */
export function CountdownTile({ href, status, countdown, firstLeg, cover, tripId, stats }: CountdownTileProps) {
  const label = countdownLabel(countdown);
  const { value, unit, lead } = countdownParts(countdown);
  const hasPhoto = cover != null;
  const isWord = unit === null;

  const chip = (
    <span className="self-start rounded-full border-2 border-border bg-card px-2.5 py-[3px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
      {status}
    </span>
  );

  const numberRow = (
    <div role="img" aria-label={label}>
      {lead ? (
        <span className={cn("block font-display font-extrabold leading-none", hasPhoto ? "mb-1.5 text-[28px]" : "mb-1 text-[22px]")}>
          {lead}
        </span>
      ) : null}
      <div className={cn("flex items-baseline", hasPhoto ? "gap-3" : "gap-2.5")}>
        <span
          className={cn(
            "font-display font-extrabold",
            isWord
              ? cn(hasPhoto ? "text-[64px]" : "text-[48px]", "leading-[0.95] tracking-[-0.04em]")
              : cn(hasPhoto ? "text-[132px]" : "text-[96px]", "leading-[0.85] tracking-[-0.06em]"),
          )}
        >
          {value}
        </span>
        {unit ? (
          <span
            className={cn(
              "flex flex-col font-display font-extrabold",
              // Size before leading: tailwind-merge drops a leading-* that precedes a text-* size.
              hasPhoto ? "text-[32px]" : "text-[26px]",
              "leading-[1.02]",
            )}
          >
            <span>{unit[0]}</span>
            <span>{unit[1]}</span>
          </span>
        ) : null}
      </div>
    </div>
  );

  const legLine = firstLeg ? (
    <p className={cn("font-semibold", hasPhoto ? "mt-4 text-[15px]" : "mt-3 text-sm")}>{firstLeg}</p>
  ) : null;

  const glance = stats && stats.length > 0 ? stats : null;
  const statItem = (s: HomeStat, padY: "py-2" | "py-1.5") => (
    <li
      key={s.label}
      className={cn("island flex min-w-[72px] flex-col rounded-[14px] border-2 border-border bg-card px-3 text-foreground", padY)}
    >
      <span className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em]">{s.value}</span>
      <span className="text-label mt-1">{s.label}</span>
    </li>
  );

  // No photo: the row under the chip, as before.
  const statsRow = glance ? (
    <ul aria-label="Trip at a glance" className="mt-4 flex flex-wrap gap-2">
      {glance.map((s) => statItem(s, "py-2"))}
    </ul>
  ) : null;

  // With a photo: a column between the number and the polaroid (Feedback
  // cmunprdsr000004l6da68grrp — a row above the number pushed it down and
  // clipped the first-leg line). Shown only from a tile width where the
  // 132px number, this column and the 176px polaroid fit side by side:
  // 52rem (832px). At 1800×1008 the tile is ~986px (8 of 12 columns beside
  // the 248px sidebar) so the column shows; at 1440 it is ~746px and the
  // column is hidden. It never wraps back into a row — below that width the
  // stats are simply not shown. The tighter py keeps four items inside the
  // 300px row (4 × 55px + 3 × 6px = 238px of the 252px available).
  const statsColumn = glance ? (
    <ul aria-label="Trip at a glance" className="hidden shrink-0 flex-col justify-center gap-1.5 self-stretch @[52rem]:flex">
      {glance.map((s) => statItem(s, "py-1.5"))}
    </ul>
  ) : null;

  return (
    <Card
      tone="coral"
      radius="xl"
      shadow={3}
      className="@container relative flex h-full min-h-0 overflow-hidden text-on-accent"
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
          {statsColumn}
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
          {statsRow}
          <div className="mt-auto">
            {numberRow}
            {legLine}
          </div>
        </div>
      )}
    </Card>
  );
}
