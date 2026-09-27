/**
 * "Your travels" — Travel stats tiles (spec §M, CONTEXT.md "Your travels").
 * Pure presentational — takes the already-computed `TravelStats`
 * (lib/travel-stats.ts) and renders the tile grid + fun-facts line list.
 * Server-renderable: no hooks, no client-only APIs.
 */
import { countryName, countryFlagEmoji } from "@/lib/countries";
import { Card } from "@/components/ui/card";
import type { TravelStats } from "@/lib/travel-stats";

export interface TravelStatsTilesProps {
  stats: TravelStats;
}

const TRANSPORT_MODES = ["FLIGHT", "TRAIN", "BUS", "FERRY", "CAR"] as const;
const TRANSPORT_LABEL: Record<(typeof TRANSPORT_MODES)[number], { singular: string; plural: string }> = {
  FLIGHT: { singular: "flight", plural: "flights" },
  TRAIN: { singular: "train", plural: "trains" },
  BUS: { singular: "bus", plural: "buses" },
  FERRY: { singular: "ferry", plural: "ferries" },
  CAR: { singular: "drive", plural: "drives" },
};

const INT_FORMAT = new Intl.NumberFormat("en-AU");

function formatCount(n: number): string {
  return INT_FORMAT.format(n);
}

function formatKm(km: number): string {
  return `${INT_FORMAT.format(Math.round(km))} km`;
}

function noun(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

interface TileProps {
  label: string;
  primary: string;
  plannedNote?: string | null;
}

function StatTile({ label, primary, plannedNote }: TileProps) {
  return (
    <Card shadow={1} className="flex min-w-0 flex-col gap-1 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-extrabold tabular-nums tracking-tight">{primary}</p>
      {plannedNote ? <p className="text-xs font-semibold text-muted-foreground">{plannedNote}</p> : null}
    </Card>
  );
}

/** "+N planned" for a count; null when there's nothing planned. */
function plannedCountNote(planned: number): string | null {
  return planned > 0 ? `+${formatCount(planned)} planned` : null;
}

export function TravelStatsTiles({ stats }: TravelStatsTilesProps) {
  const { countries, places, trips, nightsAway, accommodationNights, transport, distanceKm } = stats;

  const transportTiles = TRANSPORT_MODES.filter(
    (mode) => transport[mode].done > 0 || transport[mode].planned > 0,
  );

  const facts: string[] = [];
  if (stats.longestTrip) {
    facts.push(
      `Longest trip: ${stats.longestTrip.name} (${formatCount(stats.longestTrip.nights)} ${noun(stats.longestTrip.nights, "night", "nights")})`,
    );
  }
  if (stats.mostVisitedCountry) {
    const { code, stops } = stats.mostVisitedCountry;
    facts.push(
      `Most-visited country: ${countryFlagEmoji(code)} ${countryName(code)} (${formatCount(stops)} ${noun(stops, "stop", "stops")})`,
    );
  }
  if (stats.farthestFromHome) {
    facts.push(`Farthest from home: ${stats.farthestFromHome.stopName} (${formatKm(stats.farthestFromHome.km)})`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card shadow={1} className="flex min-w-0 flex-col gap-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Countries</p>
          <p className="font-display text-xl font-extrabold tabular-nums tracking-tight">
            {formatCount(countries.done.length)} {noun(countries.done.length, "country", "countries")}
          </p>
          {countries.done.length > 0 && (
            <p aria-hidden="true" className="text-lg leading-none">
              {countries.done.map((code) => (
                <span key={code} title={countryName(code)}>
                  {countryFlagEmoji(code)}
                </span>
              ))}
            </p>
          )}
          <span className="sr-only">{countries.done.map((code) => countryName(code)).join(", ")}</span>
          {plannedCountNote(countries.planned.length) && (
            <p className="text-xs font-semibold text-muted-foreground">{plannedCountNote(countries.planned.length)}</p>
          )}
        </Card>

        <StatTile
          label="Places"
          primary={`${formatCount(places.done)} ${noun(places.done, "place", "places")}`}
          plannedNote={plannedCountNote(places.planned)}
        />
        <StatTile
          label="Trips"
          primary={`${formatCount(trips.done)} ${noun(trips.done, "trip", "trips")} taken`}
          plannedNote={plannedCountNote(trips.planned)}
        />
        <StatTile
          label="Nights away"
          primary={`${formatCount(nightsAway.done)} ${noun(nightsAway.done, "night", "nights")}`}
          plannedNote={plannedCountNote(nightsAway.planned)}
        />
        <StatTile
          label="Accommodation"
          primary={`${formatCount(accommodationNights.done)} ${noun(accommodationNights.done, "night", "nights")}`}
          plannedNote={plannedCountNote(accommodationNights.planned)}
        />
        <StatTile label="Distance" primary={formatKm(distanceKm.done)} plannedNote={distanceKm.planned > 0 ? `+${formatKm(distanceKm.planned)} planned` : null} />
        {transportTiles.map((mode) => {
          const pair = transport[mode];
          const { singular, plural } = TRANSPORT_LABEL[mode];
          return (
            <StatTile
              key={mode}
              label={plural.charAt(0).toUpperCase() + plural.slice(1)}
              primary={`${formatCount(pair.done)} ${noun(pair.done, singular, plural)}`}
              plannedNote={plannedCountNote(pair.planned)}
            />
          );
        })}
      </div>

      {facts.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
