import { FORECAST_WINDOW_DAYS, type DayWeather } from "@/lib/weather";

export type SceneKey = "sunny" | "partly" | "overcast" | "fog" | "rain" | "snow" | "storm" | "wind" | "heat" | "night";
export type ThemeKey = SceneKey | "too-far";

export interface WeatherTheme { key: ThemeKey; scene: SceneKey | null; condition: string; chip: string | null; offline: string | null; typical: boolean }
export interface ThemeInput { day: DayWeather | null; daysOut: number; isToday: boolean; monthShort: string; now?: () => number }

const HEAT_MIN_C = 35;
const WIND_MIN_KPH = 40;
const UV_WARN = 8;

/** WMO code → scene + condition label (WEATHER_CARD §3 table). Gap codes fall to overcast. */
function byCode(code: number | null): { scene: SceneKey; condition: string } {
  if (code == null) return { scene: "overcast", condition: "Overcast" };
  if (code <= 1) return { scene: "sunny", condition: "Sunny" };
  if (code === 2) return { scene: "partly", condition: "Partly cloudy" };
  if (code === 3) return { scene: "overcast", condition: "Overcast" };
  if (code === 45 || code === 48) return { scene: "fog", condition: "Fog" };
  if (code >= 51 && code <= 57) return { scene: "rain", condition: "Drizzle" };
  if (code >= 61 && code <= 67) return { scene: "rain", condition: "Rain" };
  if (code >= 80 && code <= 82) return { scene: "rain", condition: "Showers" };
  if (code === 71 || code === 85) return { scene: "snow", condition: "Light snow" };
  if ((code >= 72 && code <= 77) || code === 86) return { scene: "snow", condition: "Snow" };
  if (code >= 95 && code <= 99) return { scene: "storm", condition: "Storms" };
  return { scene: "overcast", condition: "Overcast" };
}

function ageLabel(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function themedChip(scene: SceneKey, day: DayWeather): string | null {
  switch (scene) {
    case "rain":
    case "storm":
      return day.precipProbMax != null ? `Rain ${Math.round(day.precipProbMax)}%` : null;
    case "sunny":
    case "partly":
      return day.uvMax != null && day.uvMax >= UV_WARN ? `UV ${Math.round(day.uvMax)} · pack sunscreen` : null;
    case "snow":
      return day.snowfallCm != null && day.snowfallCm > 0 ? `${Math.round(day.snowfallCm * 10) / 10} cm · icy paths` : null;
    case "wind":
      return day.gustsKph != null ? `Gusts ${Math.round(day.gustsKph)} km/h` : null;
    case "heat":
      return "Heat warning · shade 12–3pm";
    default:
      return null;
  }
}

export function getWeatherTheme(input: ThemeInput): WeatherTheme | null {
  const { day, daysOut, isToday, monthShort } = input;
  const nowMs = (input.now ?? Date.now)();
  if (!day) {
    return daysOut > FORECAST_WINDOW_DAYS
      ? { key: "too-far", scene: null, condition: "", chip: null, offline: null, typical: false }
      : null;
  }
  const typical = day.source === "typical";
  const code = day.code;
  let picked: { scene: SceneKey; condition: string };
  if (isToday && day.current && !day.current.isDay && code != null && code <= 2) picked = { scene: "night", condition: "Clear night" };
  else if (day.highC != null && day.highC >= HEAT_MIN_C && code != null && code <= 2) picked = { scene: "heat", condition: "Scorcher" };
  else if (day.gustsKph != null && day.gustsKph >= WIND_MIN_KPH && code != null && code <= 3) picked = { scene: "wind", condition: "Windy" };
  else picked = byCode(code);

  if (day.stale) {
    return { key: picked.scene, scene: null, condition: picked.condition, chip: null, offline: `Offline · updated ${ageLabel(nowMs - day.fetchedAt)} ago`, typical };
  }
  const chip = themedChip(picked.scene, day) ?? (typical ? `Typical for ${monthShort}` : null);
  return { key: picked.scene, scene: picked.scene, condition: picked.condition, chip, offline: null, typical };
}

const FILL: Record<ThemeKey, string> = {
  sunny: "bg-wx-sunny", partly: "bg-wx-partly", overcast: "bg-wx-overcast", fog: "bg-wx-fog", rain: "bg-wx-rain",
  snow: "bg-wx-snow", storm: "bg-wx-storm", wind: "bg-wx-wind", heat: "bg-wx-heat", night: "bg-wx-night", "too-far": "bg-background",
};
export function themeFill(key: ThemeKey): string { return FILL[key]; }
