/**
 * WMO weather code → Card tone + icon, for the weather/daylight card
 * (components/trip/weather-daylight-card.tsx).
 *
 * Pure lookup, no side effects — the tones are the same categorical `hue-*`
 * ramp used by Card (components/ui/card.tsx), kept solid (never a gradient)
 * so the contrast audit can measure it (see weather-daylight-card.tsx's own
 * docblock on why).
 *
 * Reads `weatherBucket` from lib/weather.ts rather than re-deriving its own
 * ranges from the code: `weatherLabel` and `weatherTone` used to run two
 * independent lookups over the same WMO code, and they disagreed on every
 * "gap" code the ladder skips (4-44, 49-50, 68-70, 78-79, 83-84, 87-94) —
 * e.g. code 90 rendered the label "Thunderstorm" beside a plain sun icon.
 * Sharing one bucket function makes that class of drift impossible: both
 * outputs are now just two lookups keyed by the same bucket.
 */

import { weatherBucket, type WeatherBucket } from "@/lib/weather";

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

const TONE_BY_BUCKET: Record<WeatherBucket, WeatherToneResult> = {
  clear: { tone: "hue-sun", icon: "sun" },
  partly: { tone: "hue-stone", icon: "cloud" },
  overcast: { tone: "hue-stone", icon: "cloud" },
  fog: { tone: "hue-stone", icon: "cloud-fog" },
  rain: { tone: "hue-sky", icon: "cloud-rain" },
  snow: { tone: "hue-lilac", icon: "snowflake" },
  showers: { tone: "hue-sky", icon: "cloud-rain" },
  "snow-showers": { tone: "hue-lilac", icon: "snowflake" },
  storm: { tone: "hue-indigo", icon: "cloud-lightning" },
};

/** No data (null code) keeps the card's old, always-on default look. */
const NO_DATA_TONE: WeatherToneResult = { tone: "hue-sky", icon: "sun" };

/**
 * Maps a WMO weather code (lib/weather.ts's `DayWeather.code`) to a Card tone
 * and icon by condition, not always the same "sky" blue — via the same
 * cascading bucket `weatherLabel` reads, so the two can never disagree:
 *
 *   null           → no data          → sky / sun
 *   0              → clear            → sun / sun
 *   1-2            → partly cloudy    → stone / cloud
 *   3              → overcast         → stone / cloud
 *   <=48           → fog              → stone / cloud-fog
 *   <=67           → rain             → sky / cloud-rain
 *   <=77           → snow             → lilac / snowflake
 *   <=82           → showers          → sky / cloud-rain
 *   <=86           → snow showers     → lilac / snowflake
 *   else (>=87)    → thunderstorm     → indigo / cloud-lightning
 */
export function weatherTone(code: number | null): WeatherToneResult {
  const bucket = weatherBucket(code);
  return bucket == null ? NO_DATA_TONE : TONE_BY_BUCKET[bucket];
}
