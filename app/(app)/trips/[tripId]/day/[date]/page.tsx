import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireTripAccess } from "@/lib/guards";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";
import { dayTitle } from "@/lib/page-title";
import { addDays, formatDayLabel } from "@/lib/dates";
import { getDay, type DayViewData } from "@/lib/day-view-loader";
import { readTripShell, readUnreadActivityCount, readRecentActivity } from "@/lib/trip-shell-reads";
import { AddItemButton } from "@/components/trip/item-form-dialog";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { DayCarousel, type DayPanel } from "@/components/trip/day/day-carousel";
import { DayHeader } from "@/components/trip/day/day-header";
import { DayTitleInline } from "@/components/trip/day/day-title-inline";
import { DayStrip } from "@/components/trip/day/day-strip";
import { DayKeyboardNav } from "@/components/trip/day/day-keyboard-nav";
import { DayPlanCard } from "@/components/trip/day/day-plan-card";
import { TonightCard } from "@/components/trip/day/tonight-card";
import { JournalCard } from "@/components/trip/day/journal-card";
import { DayWeather } from "@/components/trip/day/day-weather";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ tripId: string; date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return ISO_DATE.test(date) ? { title: dayTitle(date) } : {};
}

/**
 * The Day view (spec 2026-09-27 §C, DAY_VIEW.md; ADR 0065). The day shown and
 * the day either side come from `getDay`, in parallel, so the carousel has a
 * neighbour to drag into view; weather streams in its own Suspense boundary
 * per day. The phone and the desktop trees are both rendered and one is
 * hidden by breakpoint (the same pattern as the Home route).
 */
export default async function DayPage({ params }: { params: Promise<{ tripId: string; date: string }> }) {
  const { tripId, date } = await params;
  const { user } = await requireTripAccess(tripId);
  const wellFormed = ISO_DATE.test(date);
  // Policy (not a BND-2 spelling exemption): this dated view always shows the
  // real plan and ignores `?plan=` — see architecture-sitrep-2026-09-22.md.
  const [data, before, after, unreadCount, recent, shell, slug] = await Promise.all([
    getDay(tripId, date, user.id),
    wellFormed ? getDay(tripId, addDays(date, -1), user.id) : Promise.resolve("invalid" as const),
    wellFormed ? getDay(tripId, addDays(date, 1), user.id) : Promise.resolve("invalid" as const),
    readUnreadActivityCount(tripId),
    readRecentActivity(tripId, 10),
    readTripShell(tripId),
    tripSlugFor(tripId),
  ]);
  if (data === "dateless") redirect(tripPath(slug, "/plan"));
  if (data === "invalid" || data === "out-of-range") notFound();
  const d: DayViewData = data;
  // getDay clamps a date just outside the Trip to its end, which would hand
  // the day shown back as its own neighbour — only a different date is a panel.
  const days = [before, d, after].filter((r): r is DayViewData => typeof r !== "string").filter((r, i, all) => all.findIndex((x) => x.date === r.date) === i);
  const shownIndex = days.findIndex((x) => x.date === d.date);

  const base = tripPath(slug);
  const prevHref = d.prevDate ? `${base}/day/${d.prevDate}` : null;
  const nextHref = d.nextDate ? `${base}/day/${d.nextDate}` : null;

  // Every add opens the existing Item dialog with the panel's date preselected
  // (spec decision 7). AddItemButton draws the "+" as its icon, so labels
  // carry no leading "+".
  const addProps = (day: DayViewData) => ({
    tripId,
    stops: day.stopOptions,
    tripStartDate: day.date,
    defaultDate: day.date,
    defaultUnscheduled: false,
    homeCurrency: day.trip.homeCurrency,
  });
  const dashedAdd = (day: DayViewData, size: "desktop" | "phone") => (
    <AddItemButton
      {...addProps(day)}
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
  const headerAdd = (
    <AddItemButton {...addProps(d)} label="Add to this day" variant="primary" size="md" className="h-11 whitespace-nowrap rounded-full px-5 text-sm font-extrabold" />
  );

  // Weather needs a located Stop; a gap day (no Stop) has none.
  const weather = (day: DayViewData, size: "regular" | "compact") =>
    day.weatherInput && day.stop ? (
      <Suspense fallback={<WeatherCardSkeleton size={size} />}>
        <DayWeather input={day.weatherInput} dateISO={day.date} today={day.today} placeName={day.stop.name} size={size} />
      </Suspense>
    ) : null;

  // Tonight: a gap day with no bed shows nothing (there is no Stop to add a
  // stay to), and the trip's last day has no night to plan.
  const tonight = (day: DayViewData, size: "desktop" | "phone") =>
    !day.isLast && (day.tonight != null || day.stop != null) ? (
      <TonightCard tripId={tripId} tonight={day.tonight} isLastDay={day.isLast} stopId={day.stop?.id ?? null} size={size} />
    ) : null;

  const dayBody = (day: DayViewData) => {
    const phoneWeather = weather(day, "compact");
    const desktopWeather = weather(day, "regular");
    const phoneTonight = tonight(day, "phone");
    const desktopTonight = tonight(day, "desktop");
    return (
      <div data-day-body className="flex flex-col gap-3.5 lg:gap-[18px]">
        {phoneWeather ? <div className="md:hidden">{phoneWeather}</div> : null}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]">
          <div className="md:hidden">
            <DayPlanCard data={day} size="phone" addButton={dashedAdd(day, "phone")} />
          </div>
          <div className="hidden md:block">
            <DayPlanCard data={day} size="desktop" addButton={dashedAdd(day, "desktop")} />
          </div>
          <div className="flex flex-col gap-3.5 lg:gap-[18px]">
            {desktopWeather ? <div className="hidden md:block">{desktopWeather}</div> : null}
            {phoneTonight ? <div data-slot="tonight" className="md:hidden">{phoneTonight}</div> : null}
            {desktopTonight ? <div data-slot="tonight" className="hidden md:block">{desktopTonight}</div> : null}
            <JournalCard tripId={tripId} date={day.date} dateLabel={formatDayLabel(day.date)} journal={day.journal} />
            <p className="text-[11px] font-semibold text-muted-foreground">
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                Weather by Open-Meteo
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  };

  const panels: DayPanel[] = days.map((day) => ({ iso: day.date, href: `${base}/day/${day.date}`, content: dayBody(day) }));

  return (
    <div className="flex flex-col gap-3.5 lg:gap-[18px]">
      <DayCarousel
        panels={panels}
        shownIndex={shownIndex}
        chrome={
          <>
            <DayKeyboardNav prevHref={prevHref} nextHref={nextHref} />
            <DayHeader
              tripId={tripId}
              tripSlug={slug}
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
          </>
        }
      />
    </div>
  );
}
