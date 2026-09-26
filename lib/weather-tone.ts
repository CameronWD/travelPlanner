/**
 * WMO weather code → Card tone + icon, for the weather/daylight card
 * (components/trip/weather-daylight-card.tsx).
 *
 * Pure lookup, no side effects — the tones are the same categorical `hue-*`
 * ramp used by Card (components/ui/card.tsx), kept solid (never a gradient)
 * so the contrast audit can measure it (see weather-daylight-card.tsx's own
 * docblock on why).
 */

export type WeatherTone = "hue-sun" | "hue-stone" | "hue-sky" | "hue-lilac" | "hue-indigo";

export type WeatherIconKey =
  | "sun"
  | "cloud"
  | "cloud-fog"
  | "cloud-rain"
  | "snowflake"
  | "cloud-lightning";

export interface WeatherToneResult {
  tone: WeatherTone;
  icon: WeatherIconKey;
}

/**
 * Maps a WMO weather code (lib/weather.ts's `DayWeather.code`) to a Card tone
 * and icon by condition, not always the same "sky" blue:
 *
 *   0        → clear            → sun / sun
 *   1-3      → cloudy           → stone / cloud
 *   45-48    → fog              → stone / cloud-fog
 *   51-67    → drizzle/rain     → sky / cloud-rain
 *   80-82    → rain showers     → sky / cloud-rain
 *   71-77    → snow             → lilac / snowflake
 *   85-86    → snow showers     → lilac / snowflake
 *   >=95     → thunderstorm     → indigo / cloud-lightning
 *   null     → no data          → sky / sun (the old default look)
 */
export function weatherTone(code: number | null): WeatherToneResult {
  if (code == null) return { tone: "hue-sky", icon: "sun" };
  if (code === 0) return { tone: "hue-sun", icon: "sun" };
  if (code >= 1 && code <= 3) return { tone: "hue-stone", icon: "cloud" };
  if (code >= 45 && code <= 48) return { tone: "hue-stone", icon: "cloud-fog" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { tone: "hue-sky", icon: "cloud-rain" };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { tone: "hue-lilac", icon: "snowflake" };
  }
  if (code >= 95) return { tone: "hue-indigo", icon: "cloud-lightning" };
  // No known WMO code falls outside the ranges above, but keep a safe
  // fallback rather than a type error for a stray/unexpected value.
  return { tone: "hue-sky", icon: "sun" };
}
