import { Suspense, use } from "react";
import { tripPath } from "@/lib/trip-path";
import { formatDayLabel } from "@/lib/dates";
import type { DayViewData, getDays } from "@/lib/day-view-loader";
import type { TravellerLike } from "@/lib/traveller";
import type { RecentActivity } from "@/components/trip/notification-bell";
import { DayAddMenu } from "@/components/day/day-add-menu";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { RegisterDayChrome } from "@/components/trip/day/day-chrome-registry";
import { DaySlotSkeleton } from "@/components/trip/day/day-slot-skeleton";
import { DayHeader } from "@/components/trip/day/day-header";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";
import { DayPlanCard } from "@/components/trip/day/day-plan-card";
import { TonightCard } from "@/components/trip/day/tonight-card";
import { JournalCard } from "@/components/trip/day/journal-card";
import { DayWeather } from "@/components/trip/day/day-weather";

type DayReads = Awaited<ReturnType<typeof getDays>>;

/** What every day's slot shares, read once by the page. */
export interface DaySlotShared {
  tripId: string;
  slug: string;
  tripName: string;
  shownDate: string;
  unreadCount: number;
  recent: RecentActivity[];
  members: TravellerLike[];
}

// Every add is a two-way menu (spec 2026-10-13 D5–D7): Something to do opens
// the Item dialog with the panel's date and covering Stop preselected; A
// flight, train or drive opens the Transport dialog with day-derived
// endpoints. DayAddMenu draws the "+" as its icon, so labels carry no
// leading "+".
function addProps(day: DayViewData, s: DaySlotShared) {
  return {
    tripId: s.tripId,
    slug: s.slug,
    date: day.date,
    stop: day.stop && !day.surprise?.dayStopHidden ? { id: day.stop.id, arriveDate: day.stop.arriveDate, departDate: day.stop.departDate } : null,
    stopOptions: day.stopOptions,
    homeCurrency: day.trip.homeCurrency,
    homeBaseName: day.trip.homeName,
    homeTimezone: day.trip.homeTimezone,
  };
}

function dashedAdd(day: DayViewData, s: DaySlotShared, size: "desktop" | "phone") {
  return (
    <DayAddMenu
      {...addProps(day, s)}
      label={size === "desktop" ? "Add something else · a place, an activity, a note" : day.hasEntries ? "Add to this day" : "Add something else"}
      variant="dashed"
      size="md"
      className={
        size === "desktop"
          ? "h-[52px] w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
          : "h-12 w-full rounded-2xl border-border text-sm font-extrabold text-foreground"
      }
    />
  );
}

// Weather needs a located Stop; a gap day (no Stop) has none.
function weather(day: DayViewData, size: "regular" | "compact") {
  const collapsed = size === "compact" && day.phase === "travelling";
  return day.weatherInput && day.stop ? (
    <Suspense fallback={collapsed ? <div role="status" aria-label="Loading weather" className="tp-pulse h-11 w-full rounded-2xl border-2 border-border bg-card" /> : <WeatherCardSkeleton size={size} />}>
      <DayWeather input={day.weatherInput} dateISO={day.date} today={day.today} placeName={day.stop.name} size={size} collapsed={collapsed} />
    </Suspense>
  ) : null;
}

// Tonight: a gap day with no bed shows nothing (there is no Stop to add a
// stay to), and the trip's last day has no night to plan. A day owned by a hidden Stop with
// no visible bed would read "No bed yet" about a stay it cannot see.
function tonight(day: DayViewData, s: DaySlotShared, size: "desktop" | "phone") {
  return !day.isLast && (day.tonight != null || (day.stop != null && !day.surprise?.dayStopHidden)) ? (
    <TonightCard tripId={s.tripId} tonight={day.tonight} isLastDay={day.isLast} stopId={day.stop?.id ?? null} size={size} />
  ) : null;
}

/**
 * The day's own header, which the carousel shows while this day is on screen.
 * The carousel swaps one day's header for the next in place, so anything
 * holding a draft or an open menu is keyed by the date: a Day title typed for
 * one day must never save onto the next.
 */
export function dayChrome(day: DayViewData, s: DaySlotShared) {
  const prevHref = day.prevDate ? tripPath(s.slug, `/day/${day.prevDate}`) : null;
  const nextHref = day.nextDate ? tripPath(s.slug, `/day/${day.nextDate}`) : null;
  const addButton = day.surprise?.whole ? null : (
    <DayAddMenu key={day.date} {...addProps(day, s)} label="Add to this day" variant="primary" size="md" className="h-11 whitespace-nowrap rounded-full px-5 text-sm font-extrabold" />
  );
  return (
    <DayHeader
      tripId={s.tripId}
      tripSlug={s.slug}
      tripName={s.tripName}
      eyebrow={day.eyebrow}
      heading={day.heading}
      subLine={day.subLine}
      subLineCompact={day.subLineCompact}
      holidays={day.holidays}
      dayTitle={<DayTitleInline key={day.date} stopId={day.dayTitleStopId} date={day.date} title={day.dayTitle} />}
      prevHref={prevHref}
      nextHref={nextHref}
      prevLabel={day.prevDate ? `Previous day: ${formatDayLabel(day.prevDate)}` : null}
      nextLabel={day.nextDate ? `Next day: ${formatDayLabel(day.nextDate)}` : null}
      unreadCount={s.unreadCount}
      recent={s.recent}
      members={s.members}
      addButton={addButton}
    />
  );
}

function DayBody({ day, shared }: { day: DayViewData; shared: DaySlotShared }) {
  const phoneWeather = weather(day, "compact");
  const desktopWeather = weather(day, "regular");
  const phoneTonight = tonight(day, shared, "phone");
  const desktopTonight = tonight(day, shared, "desktop");
  const shown = day.date === shared.shownDate;
  return (
    <div data-day-body className="flex flex-col gap-3.5 lg:gap-[18px]">
      {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]">
        <div className="md:hidden">
          <DayPlanCard data={day} size="phone" addButton={dashedAdd(day, shared, "phone")} shown={shown} />
        </div>
        <div className="hidden md:block">
          <DayPlanCard data={day} size="desktop" addButton={dashedAdd(day, shared, "desktop")} shown={shown} />
        </div>
        <div data-day-side className="flex flex-col gap-3.5 lg:sticky lg:top-6 lg:self-start lg:gap-[18px] lg:data-tall:static">
          {desktopWeather ? <div className="hidden md:block">{desktopWeather}</div> : null}
          {phoneTonight ? <div data-slot="tonight" className="md:hidden">{phoneTonight}</div> : null}
          {desktopTonight ? <div data-slot="tonight" className="hidden md:block">{desktopTonight}</div> : null}
          <JournalCard tripId={shared.tripId} date={day.date} dateLabel={formatDayLabel(day.date)} journal={day.journal} />
          <p className="text-[11px] font-semibold text-muted-foreground">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              Weather by Open-Meteo
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * One filled day of the carousel and the header it hands the carousel. `read`
 * is the getDays read the day belongs to: the page's own (already in hand) or
 * one still streaming, which this awaits behind the slot's Suspense.
 */
export function DaySlot({ iso, read, shared, chrome }: { iso: string; read: DayReads | Promise<DayReads>; shared: DaySlotShared; chrome?: React.ReactNode }) {
  const days = read instanceof Promise ? use(read) : read;
  const day = days.find((r): r is DayViewData => typeof r !== "string" && r.date === iso);
  if (!day) return <DaySlotSkeleton />;
  return (
    <>
      <RegisterDayChrome iso={iso} chrome={chrome ?? dayChrome(day, shared)} />
      <DayBody day={day} shared={shared} />
    </>
  );
}
