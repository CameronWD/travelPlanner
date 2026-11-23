import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { dayTitle } from "@/lib/page-title";
import { addDays } from "@/lib/dates";
import { dayHeading } from "@/lib/day-view-model";
import { getDays, type DayViewData } from "@/lib/day-view-loader";
import { WARM_REQUEST_HEADER } from "@/lib/offline";
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { tripTodayISO } from "@/lib/trip-today";
import { defaultDayISO } from "@/lib/day-view-default";
import type { DayPanel } from "@/components/trip/day/day-carousel";
import { DayCarouselFrame } from "@/components/trip/day/day-chrome-registry";
import { DaySlot, dayChrome, type DaySlotShared } from "@/components/trip/day/day-slot";
import { DaySlotSkeleton } from "@/components/trip/day/day-slot-skeleton";
import { DayStrip } from "@/components/trip/day/day-strip";
import { TopBarBell } from "@/components/trip/day/top-bar-bell";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How far from the day shown a slot is filled; the days the first read did not cover stream in behind it. */
const FILLED_REACH = 3;

type DaySearch = Promise<{ d?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: DaySearch }): Promise<Metadata> {
  const { d } = await searchParams;
  return typeof d === "string" && ISO_DATE.test(d) ? { title: dayTitle(d) } : {};
}

/**
 * The Day view (spec 2026-09-27 §C, DAY_VIEW.md; ADR 0065). Its address is
 * /trips/<ref>/day/<date>, which reaches this one page as `?d=<date>`
 * (lib/trip-route.ts), so a day change keeps the carousel mounted. Without a
 * date it sends the Traveller to the default day (spec decision 3), and a
 * date-less Trip to the Plan.
 *
 * The carousel has a slot for every day of the Trip. The day shown and the day either side
 * come from one getDays read (NAV-05) and paint first; the days two and three
 * away share one further read and stream in behind their own Suspense; the
 * rest are skeletons. Weather streams in its own Suspense boundary per day.
 * The phone and the desktop trees are both rendered and one is hidden by
 * breakpoint (the same pattern as the Home route).
 */
export default async function DayPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: DaySearch }) {
  const [{ tripId }, { d: date }] = await Promise.all([params, searchParams]);
  const { user } = await requireTripAccess(tripId);
  if (typeof date !== "string") {
    const [slug, trip] = await Promise.all([tripSlugFor(tripId), readTripShell(tripId)]);
    if (!trip) redirect(tripPath(slug));
    const day = defaultDayISO({ startDate: trip.startDate, endDate: trip.endDate, today: tripTodayISO(trip.stops, trip.homeTimezone) });
    redirect(day ? tripPath(slug, `/day/${day}`) : tripPath(slug, "/plan"));
  }
  const wellFormed = ISO_DATE.test(date);
  const warm = (await headers()).get(WARM_REQUEST_HEADER) === "1";
  // Policy (not a BND-2 spelling exemption): this dated view always shows the
  // real plan and ignores `?plan=` — see docs/archive/architecture-sitrep-2026-09-22.md.
  const [near, unreadCount, recent, shell, slug] = await Promise.all([
    // The day shown first, then its neighbours (ADR 0065).
    getDays(tripId, wellFormed ? [date, addDays(date, -1), addDays(date, 1)] : [date], user.id),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
    tripSlugFor(tripId),
  ]);
  const [data] = near;
  if (data === "dateless") redirect(tripPath(slug, "/plan"));
  if (data === "invalid" || data === "out-of-range") notFound();
  const d: DayViewData = data;

  // getDays clamps a date just outside the Trip to its end, which would hand
  // the day shown back as its own neighbour, so the slots come from the Trip's dates.
  const dates = d.strip.dates.map((x) => x.iso);
  const shownAt = dates.indexOf(d.date);
  const filled = new Map(near.filter((r): r is DayViewData => typeof r !== "string").map((r) => [r.date, r]));
  const ringDates = warm ? [] : dates.filter((iso, i) => Math.abs(i - shownAt) <= FILLED_REACH && !filled.has(iso));
  // A fill that fails leaves its slots skeletons; the day shown has already loaded and must stay.
  const ring =
    ringDates.length > 0
      ? getDays(tripId, ringDates, user.id).catch((err: unknown) => {
          console.error("[DayPage] failed to read the days around the day shown:", err);
          return [];
        })
      : null;

  const members = (shell?.members ?? []).map((m) => m.user);
  const tripName = shell?.name ?? d.trip.name;
  const shared: DaySlotShared = { tripId, slug, tripName, shownDate: d.date, unreadCount, recent, members };
  const seed = Object.fromEntries([...filled.values()].map((day) => [day.date, dayChrome(day, shared)]));

  // Every filled slot has the same shape, so a day that moves between the near
  // read and the further one as the window re-centres keeps its state. A near
  // day's read is already in hand: its boundary never shows the fallback.
  const panels: DayPanel[] = dates.map((iso) => ({
    iso,
    href: tripPath(slug, `/day/${iso}`),
    filled: filled.has(iso) || ringDates.includes(iso),
    content: filled.has(iso) ? (
      <Suspense fallback={<DaySlotSkeleton />}>
        <DaySlot iso={iso} read={near} shared={shared} chrome={seed[iso]} />
      </Suspense>
    ) : ring && ringDates.includes(iso) ? (
      <Suspense fallback={<DaySlotSkeleton />}>
        <DaySlot iso={iso} read={ring} shared={shared} />
      </Suspense>
    ) : (
      <DaySlotSkeleton />
    ),
  }));

  const prevHref = d.prevDate ? tripPath(slug, `/day/${d.prevDate}`) : null;
  const nextHref = d.nextDate ? tripPath(slug, `/day/${d.nextDate}`) : null;

  return (
    <div className="flex flex-col gap-3.5 lg:gap-[18px]">
      <DayCarouselFrame
        panels={panels}
        shownDate={d.date}
        seed={seed}
        fallback={{
          tripId,
          tripSlug: slug,
          tripName,
          days: dates.map((iso) => ({ iso, heading: dayHeading(iso, d.trip.startDate, d.trip.endDate) })),
          unreadCount,
          recent,
          members,
        }}
        chrome={
          <>
            <DayKeyboardNav prevHref={prevHref} nextHref={nextHref} />
            <TopBarBell tripId={tripId} unreadCount={unreadCount} recent={recent} />
            <div className="md:hidden">
              <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="phone" />
            </div>
            <div className="hidden md:block">
              <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="desktop" />
            </div>
          </>
        }
      />
    </div>
  );
}
