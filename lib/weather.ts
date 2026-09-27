import { daysBetween, parseISODate } from "@/lib/dates";

/**
 * A day's weather reading. Carries `fetchedAt`/`stale` so the Weather card
 * can render an Offline state when a refetch fails and it is serving the
 * last cached reading (spec §B) instead of silently going blank.
 */
export interface DayWeather {
  source: "forecast" | "typical";
  highC: number | null;
  lowC: number | null;
  code: number | null;
  label: string;
  /** Daily max precipitation probability, 0–100; null when the API omits it (archive). */
  precipProbMax: number | null;
  /** Daily max wind gusts, km/h. */
  gustsKph: number | null;
  /** Daily max UV index; null from the archive. */
  uvMax: number | null;
  /** Snowfall sum, cm. */
  snowfallCm: number | null;
  /** Only when `withCurrent` was requested (today): the current reading. */
  current: { tempC: number; isDay: boolean } | null;
  /** Epoch ms when this reading was fetched. */
  fetchedAt: number;
  /** True when the fetch failed and this is the last cached reading. */
  stale: boolean;
}

export const FORECAST_WINDOW_DAYS = 16;
const FORECAST_TTL_MS = 3600 * 1000;
const TYPICAL_TTL_MS = 86400 * 1000;

interface CacheEntry {
  value: DayWeather | null;
  fetchedAt: number;
  ttlMs: number;
}
const cache = new Map<string, CacheEntry>();
const round = (n: number) => Math.round(n * 10) / 10; // ~11km grid for cache key

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * WMO weather code → coarse condition bucket. This is the single cascading
 * `<=` ladder both `weatherLabel` and `lib/weather-tone.ts`'s `weatherTone`
 * read from, so a label and a tone/icon can never disagree about the same
 * code — including "gap" codes the WMO table skips (e.g. 4-44, 68-70) that
 * would otherwise fall through a range-based lookup to a wrong default.
 */
export type WeatherBucket =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "showers"
  | "snow-showers"
  | "storm";

export function weatherBucket(code: number | null): WeatherBucket | null {
  if (code == null) return null;
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow-showers";
  return "storm";
}

const WEATHER_LABEL_BY_BUCKET: Record<WeatherBucket, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  overcast: "Overcast",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  showers: "Showers",
  "snow-showers": "Snow showers",
  storm: "Thunderstorm",
};

/** WMO weather code → short label. */
export function weatherLabel(code: number | null): string {
  const bucket = weatherBucket(code);
  return bucket == null ? "—" : WEATHER_LABEL_BY_BUCKET[bucket];
}

interface OpenMeteoResponse {
  daily?: Record<string, unknown[]>;
  current?: { temperature_2m?: unknown; is_day?: unknown };
}

function parseDaily(j: OpenMeteoResponse, source: DayWeather["source"], fetchedAt: number): DayWeather {
  const d = j?.daily ?? {};
  const code = num(d.weathercode?.[0]);
  const cur = j?.current;
  return {
    source,
    highC: num(d.temperature_2m_max?.[0]),
    lowC: num(d.temperature_2m_min?.[0]),
    code,
    label: weatherLabel(code),
    precipProbMax: num(d.precipitation_probability_max?.[0]),
    gustsKph: num(d.wind_gusts_10m_max?.[0]),
    uvMax: num(d.uv_index_max?.[0]),
    snowfallCm: num(d.snowfall_sum?.[0]),
    current:
      cur && num(cur.temperature_2m) != null
        ? { tempC: cur.temperature_2m as number, isDay: cur.is_day === 1 }
        : null,
    fetchedAt,
    stale: false,
  };
}

export async function getDayWeather(args: {
  lat: number;
  lng: number;
  dateISO: string;
  today: string;
  /** Also fetch current temperature + is_day (Today view only). */
  withCurrent?: boolean;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}): Promise<DayWeather | null> {
  const { lat, lng, dateISO, today, withCurrent } = args;
  const nowMs = (args.now ?? Date.now)();
  const key = `${round(lat)},${round(lng)},${dateISO},${withCurrent ? "c" : "d"}`;

  const entry = cache.get(key);
  if (entry && nowMs - entry.fetchedAt < entry.ttlMs) {
    return entry.value;
  }

  const out = daysBetween(today, dateISO); // dateISO - today, in days
  const isForecast = out >= 0 && out <= FORECAST_WINDOW_DAYS;
  const ttlMs = isForecast ? FORECAST_TTL_MS : TYPICAL_TTL_MS;

  let value: DayWeather | null = null;
  try {
    if (isForecast) {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,wind_gusts_10m_max,uv_index_max,snowfall_sum",
      );
      u.searchParams.set("start_date", dateISO);
      u.searchParams.set("end_date", dateISO);
      u.searchParams.set("timezone", "UTC");
      if (withCurrent) {
        u.searchParams.set("current", "temperature_2m,is_day");
      }
      const res = await fetch(u.toString(), { next: { revalidate: 3600 } } as RequestInit);
      if (res.ok) {
        const j = await res.json();
        value = parseDaily(j, "forecast", nowMs);
      }
    } else {
      // "Typical": same calendar date, previous year, from the archive API.
      // If the target date is Feb 29 (leap day), fall back to Feb 28 in the prior year.
      const d = parseISODate(dateISO);
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCMonth() === 1 && d.getUTCDate() === 29 ? 28 : d.getUTCDate();
      const prevYear = `${d.getUTCFullYear() - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const u = new URL("https://archive-api.open-meteo.com/v1/archive");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,weathercode,wind_gusts_10m_max,snowfall_sum",
      );
      u.searchParams.set("start_date", prevYear);
      u.searchParams.set("end_date", prevYear);
      u.searchParams.set("timezone", "UTC");
      const res = await fetch(u.toString(), { next: { revalidate: 86400 } } as RequestInit);
      if (res.ok) {
        const j = await res.json();
        value = parseDaily(j, "typical", nowMs);
      }
    }
  } catch {
    value = null; // best-effort; never throw
  }

  if (value != null) {
    cache.set(key, { value, fetchedAt: nowMs, ttlMs });
    return value;
  }

  // Fetch failed or !res.ok: serve the last cached reading (flagged stale)
  // rather than overwriting the entry, so a transient outage doesn't erase
  // a good reading; only cache the null result when there is nothing to fall
  // back on, retrying sooner (1 minute) than a normal TTL.
  if (entry && entry.value != null) {
    return { ...entry.value, stale: true };
  }
  cache.set(key, { value: null, fetchedAt: nowMs, ttlMs: 60_000 });
  return null;
}
