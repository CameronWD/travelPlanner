import { MapPin, Home, ArrowRight } from "lucide-react";
import { getDayWeather } from "@/lib/weather";
import { daylight, utcHmToZone } from "@/lib/daylight";
import { instantToZonedTime } from "@/lib/tz";
import { tzAbbrev } from "@/lib/dates";
import { WeatherDaylightCard } from "@/components/trip/weather-daylight-card";
import { orderDayEntries, type DayPlan } from "@/lib/itinerary";
import type { ShareScope } from "@/lib/share-view";

// ---------------------------------------------------------------------------
// The share page's lead card while the trip is Travelling: where they are,
// what time it is there, the weather, and today's plan — each section only
// as the link's scope allows. Read by family at home, so it summarises;
// the full day-by-day below carries the detail.
// ---------------------------------------------------------------------------

export interface ShareTodayCardProps {
  countdown: string;
  timeZone: string;
  todayISO: string;
  stop: { name: string; country: string | null; lat: number | null; lng: number | null } | null;
  day: DayPlan | null;
  stay: { name: string; address: string | null } | null;
  scope: ShareScope;
}

const MODE_LABELS: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  CAR: "Car",
  FERRY: "Ferry",
  OTHER: "Transport",
};

export async function ShareTodayCard({
  countdown,
  timeZone,
  todayISO,
  stop,
  day,
  stay,
  scope,
}: ShareTodayCardProps) {
  // Weather + daylight for today at the current stop (public data; leaks nothing).
  const wx =
    stop?.lat != null && stop?.lng != null
      ? await getDayWeather({ lat: stop.lat, lng: stop.lng, dateISO: todayISO, today: todayISO })
      : null;
  const dlRaw = stop?.lat != null && stop?.lng != null ? daylight(stop.lat, stop.lng, todayISO) : null;
  const dl = dlRaw
    ? {
        sunrise: dlRaw.sunriseUTC != null ? utcHmToZone(todayISO, dlRaw.sunriseUTC, timeZone) : null,
        sunset: dlRaw.sunsetUTC != null ? utcHmToZone(todayISO, dlRaw.sunsetUTC, timeZone) : null,
        dayLengthMin: dlRaw.dayLengthMin,
        polarDay: dlRaw.polarDay,
        polarNight: dlRaw.polarNight,
        tzLabel: tzAbbrev(timeZone, todayISO),
      }
    : null;

  const localTime = instantToZonedTime(new Date(), timeZone);
  const ordered = day ? orderDayEntries(day) : null;
  const transportEntries = ordered
    ? ordered.entries.filter(
        (e) => e.kind === "transport-departure" || e.kind === "transport-arrival",
      )
    : [];
  const itemEntries = ordered ? ordered.entries.filter((e) => e.kind === "item") : [];
  const anytime = ordered?.anytime ?? [];

  return (
    <section
      aria-labelledby="today-heading"
      className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {countdown}
          </p>
          <h2 id="today-heading" className="font-display text-2xl font-bold text-foreground">
            {stop ? (
              <span className="flex items-center gap-2">
                <MapPin className="size-5 text-primary" aria-hidden="true" />
                {stop.name}
                {stop.country && (
                  <span className="text-base font-normal text-muted-foreground">{stop.country}</span>
                )}
              </span>
            ) : (
              "On the move"
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {localTime} local time · {tzAbbrev(timeZone, todayISO)}
          </p>
        </div>
        {dl && (
          <div data-testid="share-weather">
            <WeatherDaylightCard compact weather={wx} daylight={dl} />
          </div>
        )}
      </div>

      {/* Today's transport (scope-gated at fetch; entries absent when off) */}
      {scope.includeTransport && transportEntries.length > 0 && (
        <div className="space-y-1.5">
          {transportEntries.map((entry) => {
            if (entry.kind !== "transport-departure" && entry.kind !== "transport-arrival") return null;
            const t = entry.transport;
            const isDep = entry.kind === "transport-departure";
            const time = isDep
              ? "depTimeLabel" in entry ? entry.depTimeLabel : null
              : "arrTimeLabel" in entry ? entry.arrTimeLabel : null;
            return (
              <div key={`${entry.kind}-${t.id}`} className="flex items-center gap-2 text-sm">
                {time && <span className="font-mono text-xs text-muted-foreground w-10 text-right shrink-0">{time}</span>}
                <span className="font-medium text-foreground">
                  {isDep ? "Departs" : "Arrives"} — {MODE_LABELS[t.mode] ?? t.mode}
                </span>
                {t.depPlace && t.arrPlace && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                    <span className="truncate">{t.depPlace}</span>
                    <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.arrPlace}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Today's plan (only when the link shares daily plans) */}
      {scope.includeDailyPlans && (
        <div className="space-y-1.5">
          {itemEntries.length === 0 && anytime.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Nothing planned today.</p>
          ) : (
            <>
              {itemEntries.map((entry) => {
                if (entry.kind !== "item") return null;
                const { item } = entry;
                return (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground w-10 text-right shrink-0">
                      {item.startTime}
                    </span>
                    <span className="text-foreground">{item.title}</span>
                  </div>
                );
              })}
              {anytime.map((entry) => (
                <div key={entry.item.id} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0" aria-hidden="true" />
                  <span className="text-foreground/80">{entry.item.title}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tonight's stay (null when scope hides accommodation OR none exists) */}
      {stay && (
        <div className="flex items-center gap-2 border-t border-primary/10 pt-3 text-sm text-muted-foreground">
          <Home className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Tonight — <span className="font-medium text-foreground">{stay.name}</span>
            {stay.address && <span className="ml-1 text-xs">· {stay.address}</span>}
          </span>
        </div>
      )}
    </section>
  );
}
