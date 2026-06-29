import { daysBetween, parseISODate } from "@/lib/dates";

export interface DayWeather {
  source: "forecast" | "typical";
  highC: number | null;
  lowC: number | null;
  code: number | null;
  label: string;
}

const FORECAST_WINDOW_DAYS = 16;
const cache = new Map<string, DayWeather | null>();
const round = (n: number) => Math.round(n * 10) / 10; // ~11km grid for cache key

/** WMO weather code → short label. */
export function weatherLabel(code: number | null): string {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}

export async function getDayWeather(args: {
  lat: number; lng: number; dateISO: string; today: string;
}): Promise<DayWeather | null> {
  const { lat, lng, dateISO, today } = args;
  const key = `${round(lat)},${round(lng)},${dateISO}`;
  if (cache.has(key)) return cache.get(key)!;

  const out = daysBetween(today, dateISO); // dateISO - today, in days
  let result: DayWeather | null = null;
  try {
    if (out >= 0 && out <= FORECAST_WINDOW_DAYS) {
      const u = new URL("https://api.open-meteo.com/v1/forecast");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
      u.searchParams.set("start_date", dateISO);
      u.searchParams.set("end_date", dateISO);
      u.searchParams.set("timezone", "UTC");
      const res = await fetch(u.toString(), { next: { revalidate: 3600 } } as RequestInit);
      if (res.ok) {
        const j = await res.json();
        result = {
          source: "forecast",
          highC: j.daily?.temperature_2m_max?.[0] ?? null,
          lowC: j.daily?.temperature_2m_min?.[0] ?? null,
          code: j.daily?.weathercode?.[0] ?? null,
          label: weatherLabel(j.daily?.weathercode?.[0] ?? null),
        };
      }
    } else {
      // "Typical": same calendar date, previous year, from the archive API.
      const d = parseISODate(dateISO);
      const prevYear = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const u = new URL("https://archive-api.open-meteo.com/v1/archive");
      u.searchParams.set("latitude", String(lat));
      u.searchParams.set("longitude", String(lng));
      u.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weathercode");
      u.searchParams.set("start_date", prevYear);
      u.searchParams.set("end_date", prevYear);
      u.searchParams.set("timezone", "UTC");
      const res = await fetch(u.toString(), { next: { revalidate: 86400 } } as RequestInit);
      if (res.ok) {
        const j = await res.json();
        result = {
          source: "typical",
          highC: j.daily?.temperature_2m_max?.[0] ?? null,
          lowC: j.daily?.temperature_2m_min?.[0] ?? null,
          code: j.daily?.weathercode?.[0] ?? null,
          label: weatherLabel(j.daily?.weathercode?.[0] ?? null),
        };
      }
    }
  } catch {
    result = null; // best-effort; never throw
  }

  cache.set(key, result);
  return result;
}
