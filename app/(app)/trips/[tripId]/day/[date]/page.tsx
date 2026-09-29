import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { dayTitle } from "@/lib/page-title";
import { formatDayLabel } from "@/lib/dates";
import { getDay, type DayViewData } from "@/lib/day-view-loader";
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { ViewTransition } from "@/components/ui/view-transition";
import { DAY_BODY_TRANSITION } from "@/components/trip/day/day-transition";
import { DayHeader } from "@/components/trip/day/day-header";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";
import { DayStrip } from "@/components/trip/day/day-strip";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DaySwipe } from "@/components/trip/day/day-swipe";
import { DayPlanCard } from "@/components/trip/day/day-plan-card";
import { TonightCard } from "@/components/trip/day/tonight-card";
import { JournalCard } from "@/components/trip/day/journal-card";
import { DayWeather } from "@/components/trip/day/day-weather";

export async function generateMetadata({ params }: { params: Promise<{ tripId: string; date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { title: dayTitle(date) } : {};
}

/**
 * The Day view (spec 2026-09-27 §C, DAY_VIEW.md). All data comes from
 * `getDay`; weather streams in its own Suspense boundary. The phone and the
 * desktop trees are both rendered and one is hidden by breakpoint (the same
 * pattern as the Home route).
 */
export default async function DayPage({ params }: { params: Promise<{ tripId: string; date: string }> }) {
  const { tripId, date } = await params;
  const { user } = await requireTripAccess(tripId);
  // Policy (not a BND-2 spelling exemption): this dated view always shows the
  // real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
  const [data, unreadCount, recent, shell] = await Promise.all([
    getDay(tripId, date, user.id),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
  ]);
  if (data === "dateless") redirect(`/trips/${tripId}/plan`);
  if (data === "invalid" || data === "out-of-range") notFound();
  const d: DayViewData = data;

  const base = `/trips/${tripId}`;
  const prevHref = d.prevDate ? `${base}/day/${d.prevDate}` : null;
  const nextHref = d.nextDate ? `${base}/day/${d.nextDate}` : null;
  const dateLabel = formatDayLabel(d.date);

  // Every add opens the existing Item dialog with this date preselected
  // (spec decision 7). AddItemButton draws the "+" as its icon, so labels
  // carry no leading "+".
  const addProps = {
    tripId,
    stops: d.stopOptions,
    tripStartDate: d.date,
    defaultDate: d.date,
    defaultUnscheduled: false,
    homeCurrency: d.trip.homeCurrency,
  };
  const dashedAdd = (size: "desktop" | "phone") => (
    <AddItemButton
      {...addProps}
      label={size === "desktop" ? "Add something else · a place, an activity, a note" : d.hasEntries ? "Add to this day" : "Add something else"}
      variant="dashed"
      size="md"
      className={
        size === "desktop"
          ? "h-[52px] w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
          : "h-12 w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
      }
    />
  );
  const headerAdd = (
    <AddItemButton {...addProps} label="Add to this day" variant="primary" size="md" className="h-11 whitespace-nowrap rounded-full px-5 text-sm font-extrabold" />
  );

  // Weather needs a located Stop; a gap day (no Stop) has none.
  const weather = (size: "regular" | "compact") =>
    d.weatherInput && d.stop ? (
      <Suspense fallback={<WeatherCardSkeleton size={size} />}>
        <DayWeather input={d.weatherInput} dateISO={d.date} today={d.today} placeName={d.stop.name} size={size} />
      </Suspense>
    ) : null;

  // Tonight: a gap day with no bed shows nothing (there is no Stop to add a
  // stay to), and the trip's last day has no night to plan.
  const showTonight = !d.isLast && (d.tonight != null || d.stop != null);
  const tonight = (size: "desktop" | "phone") =>
    showTonight ? <TonightCard tripId={tripId} tonight={d.tonight} isLastDay={d.isLast} stopId={d.stop?.id ?? null} size={size} /> : null;

  const phoneWeather = weather("compact");
  const desktopWeather = weather("regular");
  const phoneTonight = tonight("phone");
  const desktopTonight = tonight("desktop");

  return (
    <DaySwipe prevHref={prevHref} nextHref={nextHref}>
      <DayKeyboardNav prevHref={prevHref} nextHref={nextHref} />
      <div className="flex flex-col gap-3.5 lg:gap-[18px]">
        <DayHeader
          tripId={tripId}
          tripName={shell?.name ?? d.trip.name}
          eyebrow={d.eyebrow}
          heading={d.heading}
          subLine={d.subLine}
          subLineCompact={d.subLineCompact}
          dayTitle={<DayTitleInline stopId={d.dayTitleStopId} date={d.date} title={d.dayTitle} />}
          prevHref={prevHref}
          nextHref={nextHref}
          prevLabel={d.prevDate ? `Previous day: ${formatDayLabel(d.prevDate)}` : null}
          nextLabel={d.nextDate ? `Next day: ${formatDayLabel(d.nextDate)}` : null}
          unreadCount={unreadCount}
          recent={recent}
          members={(shell?.members ?? []).map((m) => m.user)}
          addButton={headerAdd}
        />
        <div className="md:hidden">
          <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="phone" />
        </div>
        <div className="hidden md:block">
          <DayStrip tripId={tripId} dates={d.strip.dates} line={d.strip.line} size="desktop" />
        </div>
        {/* Only the body slides between days (ADR 0063); header and strip stay put. */}
        <ViewTransition {...DAY_BODY_TRANSITION}>
          <div data-day-body className="flex flex-col gap-3.5 lg:gap-[18px]">
            {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]">
              <div className="md:hidden">
                <DayPlanCard data={d} size="phone" addButton={dashedAdd("phone")} />
              </div>
              <div className="hidden md:block">
                <DayPlanCard data={d} size="desktop" addButton={dashedAdd("desktop")} />
              </div>
              <div className="flex flex-col gap-3.5 lg:gap-[18px]">
                {desktopWeather ? <div className="hidden md:block">{desktopWeather}</div> : null}
                {phoneTonight ? <div data-slot="tonight" className="md:hidden">{phoneTonight}</div> : null}
                {desktopTonight ? <div data-slot="tonight" className="hidden md:block">{desktopTonight}</div> : null}
                <JournalCard tripId={tripId} date={d.date} dateLabel={dateLabel} journal={d.journal} />
                <p className="text-[11px] font-semibold text-muted-foreground">
                  <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    Weather by Open-Meteo
                  </a>
                </p>
              </div>
            </div>
          </div>
        </ViewTransition>
      </div>
    </DaySwipe>
  );
}
