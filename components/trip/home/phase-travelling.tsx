import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Bed, ArrowRight } from "lucide-react";
import { formatLongDate } from "@/lib/dates";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { countdownFor, type Countdown } from "@/lib/countdown";
import { loadTravellingHome, type DatedTravellingHome } from "@/lib/travelling-home-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/trip/timeline";
import { DayMapPanel } from "@/components/trip/day-map-panel";
import { NearbyWishlist } from "@/components/trip/nearby-wishlist";
import { DayIdeas } from "@/components/trip/day-ideas";
import { MapLink } from "@/components/trip/map-link";
import { TransportCountdown } from "@/components/trip/transport-countdown";
import { SpendSoFarCard } from "@/components/trip/spend-so-far-card";
import { AttachmentLinks } from "@/components/trip/attachment-links";
import { ChapterChip } from "@/components/trip/chapter-chip";
import { UpcomingPaymentsCard } from "@/components/trip/upcoming-payments-card";
import { TodaysJournal } from "@/components/trip/todays-journal";
import { TravellingDesktopGrid } from "@/components/trip/home/desktop/desktop-home-grid";
import { CountdownTile, type CountdownTileProps } from "@/components/trip/home/desktop/countdown-tile";
import { SpendSoFarTile } from "@/components/trip/home/desktop/spend-so-far-tile";
import { TodayTile } from "@/components/trip/home/desktop/today-tile";
import { HOME_GRID_GAP, HOME_STACK } from "@/components/trip/home/spacing";

/** Exported for className assertion in tests — must match the JSX below. */
export const TRAVELLING_DESKTOP_GRID_CLASS =
  `grid grid-cols-1 ${HOME_GRID_GAP} lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start`;

export async function PhaseTravelling({
  tripId,
  userId,
  reminders,
  layout = "phone",
  cover = null,
}: {
  tripId: string;
  /** The signed-in Traveller — loads their own Today's journal slot
   * (spec K) separately from everyone else's. Optional only so existing
   * callers/tests that don't exercise the Journal card keep compiling;
   * the real page always has one. */
  userId?: string;
  /** The trip Home's Reminders card, rendered by the page for every Phase —
   * this phase's job is only to place it at the end of the right rail.
   * Phone layout only: the desktop grid has no Reminders panel (they live
   * on Checklists, Task 16). */
  reminders?: ReactNode;
  /** "phone" (default): the single-column/rail Phase, unchanged. "desktop":
   * the lg+ 3-row grid (spec D) under the page's HomeHeader. Both read the
   * same cache()d model, so rendering both on one request queries once. */
  layout?: "phone" | "desktop";
  /** Desktop only: the Trip's cover for the countdown tile's polaroid. */
  cover?: CountdownTileProps["cover"];
}) {
  const model = await loadTravellingHome(tripId, userId ?? null);
  const slug = await tripSlugFor(tripId);

  // A date-less trip has no calendar to anchor "today" against. Reminders
  // still need a home even in this defensive branch, since the page passes
  // them in regardless of phase.
  if (model.kind === "no-dates") {
    return (
      <div className={HOME_STACK}>
        <EmptyState
          icon={CalendarDays}
          tone="sun"
          title="No dates yet."
          description="Set your trip's start date to see a day-by-day view of today."
        />
        {layout === "phone" ? reminders : null}
      </div>
    );
  }

  if (layout === "desktop") return <TravellingDesktop tripId={tripId} tripSlug={slug} model={model} cover={cover} />;

  const {
    startDate,
    effectiveDate,
    isBeforeTrip,
    isAfterTrip,
    isWithinTrip,
    currentChapter,
    dayNum,
    totalDays,
    todaysDayTitle,
    dayPlan,
    hasEntries,
    attachmentsByTarget,
    tonightAccom,
    nextTransport,
    effectiveStop,
    stopLocated,
    spend,
    homeCurrency,
    upcomingPayments,
    dayMapModel,
    itemDirections,
    freeForm,
    thingsToDo,
    wishlistIdeas,
    nearby,
    todaysJournal,
  } = model;

  return (
    <div className={HOME_STACK}>
      {/* ── Header (kit Today: "Day 6 of 12" label over the date) ── */}
      <div className="flex flex-col gap-1 pt-2">
        {isWithinTrip && (
          <p className="flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
            <span>
              Day {dayNum} of {totalDays}
            </span>
            {currentChapter && (
              <>
                <span aria-hidden="true">·</span>
                <ChapterChip name={currentChapter.name} colour={currentChapter.colour} />
              </>
            )}
          </p>
        )}
        {todaysDayTitle && (
          <p className="text-sm font-bold text-muted-foreground">{todaysDayTitle}</p>
        )}
        <h2 className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-foreground lg:text-4xl">
          <span className="sr-only">Today, </span>
          {formatLongDate(effectiveDate)}
        </h2>

        {/* Out-of-trip notice */}
        {isBeforeTrip && (
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Your trip starts on {formatLongDate(startDate)} — here&apos;s day one.
          </p>
        )}
        {isAfterTrip && (
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Your trip has ended. Looking back at the last day.
          </p>
        )}
      </div>

      {/* ── Two-column desktop grid (kit Today: main column + side rail) ── */}
      {/* Mobile: single column; cards stack in natural order (up next + plan first, rail below). */}
      <div className={TRAVELLING_DESKTOP_GRID_CLASS} data-testid="today-grid">
        {/* ── Main column: up next · today's plan · day-map · ideas ── */}
        <div className={`${HOME_STACK} lg:order-1`}>
          {/* Next transport countdown (kit "Up next" card) */}
          {nextTransport && (
            <TransportCountdown
              depAt={nextTransport.depAt}
              depTimeLabel={nextTransport.depTimeLabel}
              depZone={nextTransport.depZone}
              label={nextTransport.label}
            />
          )}

          <Card className="p-3.5 lg:p-5">
            <h3 className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
              Today&apos;s plan
            </h3>
            <div className="mt-2.5">
              {dayPlan && hasEntries ? (
                <Timeline day={dayPlan} variant="day" itemDirections={itemDirections} attachmentsByTarget={attachmentsByTarget} />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  tone="sun"
                  title="Nothing planned"
                  description="Nothing is scheduled for this day yet."
                  className="py-5"
                />
              )}
            </div>
          </Card>

          {/* Day map (collapsed toggle) */}
          <DayMapPanel tripId={tripId} model={dayMapModel} />

          {/* Day ideas on free-form days; Nearby Wishlist on planned days */}
          {freeForm ? (
            <DayIdeas
              tripId={tripId}
              date={effectiveDate}
              thingsToDo={thingsToDo}
              wishlistIdeas={wishlistIdeas}
            />
          ) : (
            <NearbyWishlist tripId={tripId} date={effectiveDate} items={nearby} />
          )}
        </div>

        {/* ── Right rail: tonight · where-you-are · spend · payments · reminders ── */}
        <div className={`${HOME_STACK} lg:order-2`} data-home-aside>
          {/* Tonight's accommodation (kit "Tonight" card on the stay fill) */}
          {tonightAccom && (
            <Card tone="lilac" className="p-4 lg:p-5">
              <h3 className="text-label">Tonight&apos;s stay</h3>
              <div className="mt-1.5 flex items-start gap-2.5">
                <Bed className="mt-1 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-extrabold leading-tight tracking-[-0.03em]">
                    {tonightAccom.name}
                  </p>
                  {tonightAccom.address && (
                    <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold">
                      <span className="truncate">{tonightAccom.address}</span>
                      <MapLink
                        lat={tonightAccom.lat}
                        lng={tonightAccom.lng}
                        address={tonightAccom.address}
                        label={tonightAccom.name}
                        className="shrink-0 text-foreground"
                      />
                    </div>
                  )}
                  {!tonightAccom.address && (
                    <MapLink
                      lat={tonightAccom.lat}
                      lng={tonightAccom.lng}
                      label={tonightAccom.name}
                      className="mt-1 text-[13px] font-semibold text-foreground"
                    />
                  )}
                  <AttachmentLinks attachments={attachmentsByTarget[tonightAccom.id] ?? []} />
                </div>
              </div>
            </Card>
          )}

          {/* Where you are */}
          {effectiveStop && (
            <Card className="p-4">
              <h3 className="text-label text-muted-foreground">Where you are</h3>
              <div className="mt-1.5 flex items-center gap-2">
                {/* No decorative pin here: MapLink below renders the real one,
                    and help-legend.tsx teaches that glyph as "has a location"
                    (HG-02/HG-10, missed instance found as SW-02). */}
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-foreground">
                    {effectiveStop.name}
                  </span>
                  {effectiveStop.country && (
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      {effectiveStop.country}
                    </span>
                  )}
                </div>
                {/* Gate on real coordinates explicitly: MapLink's own fallback
                    (address || label) would otherwise treat the name/country
                    label as a searchable "location" for every stop, firing the
                    pin even where no location is on record. */}
                {stopLocated?.lat != null && stopLocated?.lng != null && (
                  <MapLink
                    lat={stopLocated.lat}
                    lng={stopLocated.lng}
                    label={
                      effectiveStop.country
                        ? `${effectiveStop.name}, ${effectiveStop.country}`
                        : effectiveStop.name
                    }
                    className="text-muted-foreground hover:text-foreground"
                  />
                )}
              </div>
            </Card>
          )}

          {/* Spend so far (compact glance) */}
          <SpendSoFarCard compact spend={spend} homeCurrency={homeCurrency} />

          {/* Upcoming payments */}
          <UpcomingPaymentsCard payments={upcomingPayments} tripId={tripId} tripSlug={slug} />

          {reminders}
        </div>
      </div>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="md">
          <Link href={tripPath(slug, `/day/${effectiveDate}`)}>
            <CalendarDays aria-hidden="true" />
            Full day view
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="md">
          <Link href={tripPath(slug, "/calendar")}>
            <CalendarDays aria-hidden="true" />
            Calendar
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* Today's journal (spec K) — last card on the phone column (and the
          last, full-width row of the desktop grid — TravellingDesktop). */}
      {todaysJournal && (
        <TodaysJournal
          tripId={tripId}
          date={effectiveDate}
          mine={todaysJournal.mine}
          minePhoto={todaysJournal.minePhoto}
          others={todaysJournal.others}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop (lg+) — spec D
// ---------------------------------------------------------------------------

/** The countdown tile's number: "Day N of M" inside the Trip's dates, the
 * same count the phone header shows (day 1 included — never "Today"). */
function travellingCountdown(model: DatedTravellingHome): Countdown {
  if (model.isWithinTrip) return { kind: "day", n: model.dayNum, of: model.totalDays };
  return countdownFor({ startDate: model.startDate, endDate: model.endDate, today: model.today });
}

function TravellingDesktop({
  tripId,
  tripSlug,
  model,
  cover,
}: {
  tripId: string;
  tripSlug: string;
  model: DatedTravellingHome;
  cover: CountdownTileProps["cover"];
}) {
  const base = tripPath(tripSlug);
  const { effectiveDate, effectiveStop, spend, todaysJournal } = model;
  const stopLine = effectiveStop
    ? effectiveStop.country
      ? `${effectiveStop.name}, ${effectiveStop.country}`
      : effectiveStop.name
    : null;

  return (
    <TravellingDesktopGrid
      hasCover={cover != null}
      countdown={
        <CountdownTile
          href={`${base}/plan`}
          status="TRAVELLING"
          countdown={travellingCountdown(model)}
          firstLeg={stopLine}
          cover={cover}
          tripId={tripId}
        />
      }
      spend={
        <SpendSoFarTile
          href={`${base}/budget`}
          currency={model.homeCurrency}
          paidSoFarMinor={spend.paidSoFarMinor}
          costTotalMinor={spend.costTotalMinor}
          varianceMinor={spend.varianceMinor}
          tripElapsedPct={spend.tripElapsedPct}
        />
      }
      today={
        <TodayTile
          dayHref={`${base}/day/${effectiveDate}`}
          dateISO={effectiveDate}
          dayTitle={model.todaysDayTitle}
          plan={
            model.dayPlan && model.hasEntries ? (
              <Timeline
                day={model.dayPlan}
                variant="day"
                itemDirections={model.itemDirections}
                attachmentsByTarget={model.attachmentsByTarget}
              />
            ) : null
          }
          nextTransport={model.nextTransport}
          tonight={model.tonightAccom ? { name: model.tonightAccom.name, address: model.tonightAccom.address } : null}
        />
      }
      map={<DayMapPanel tripId={tripId} model={model.dayMapModel} variant="tile" />}
      journal={
        todaysJournal ? (
          <TodaysJournal
            tripId={tripId}
            date={effectiveDate}
            mine={todaysJournal.mine}
            minePhoto={todaysJournal.minePhoto}
            others={todaysJournal.others}
            headingLevel={2}
          />
        ) : null
      }
    />
  );
}
