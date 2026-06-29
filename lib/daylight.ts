/**
 * Offline sunrise/sunset computation using the NOAA Solar Calculator algorithm.
 *
 * Formula source:
 *   NOAA Earth System Research Laboratories — Solar Calculator
 *   https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *   Spreadsheet "NOAA_Solar_Calculations_day.xls" (public domain)
 *
 * The algorithm is a standard astronomical approximation accurate to ±1 min
 * for dates within ±0.5 century of J2000 and latitudes below the Arctic/Antarctic
 * circles. Polar day/night edge cases are handled explicitly.
 */

import { parseISODate } from "@/lib/dates";

export interface DaylightResult {
  /** Sunrise time in HH:MM (UTC), or null on polar day / polar night. */
  sunriseUTC: string | null;
  /** Sunset time in HH:MM (UTC), or null on polar day / polar night. */
  sunsetUTC: string | null;
  /** Day length in minutes (0 on polar night, 1440 on polar day). */
  dayLengthMin: number;
  /** True when the sun never sets (midnight sun). */
  polarDay: boolean;
  /** True when the sun never rises. */
  polarNight: boolean;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Convert total fractional minutes past UTC midnight to an "HH:MM" string. */
function minToHHMM(totalMin: number): string {
  // Clamp/wrap to [0, 1440)
  const clamped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = Math.round(clamped % 60);
  // Handle rounding to 60 min
  if (m === 60) {
    return `${String((h + 1) % 24).padStart(2, "0")}:00`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute sunrise and sunset for a given latitude, longitude, and date.
 *
 * @param lat - Latitude in decimal degrees (negative = south).
 * @param lng - Longitude in decimal degrees (negative = west).
 * @param dateISO - Date in YYYY-MM-DD format (UTC calendar date).
 */
export function daylight(lat: number, lng: number, dateISO: string): DaylightResult {
  const date = parseISODate(dateISO);

  // ---------------------------------------------------------------------------
  // Step 1 — Julian Day Number
  // ---------------------------------------------------------------------------
  // J2000 epoch: 2000-01-01T12:00:00Z = JD 2451545.0
  // Our date is midnight UTC, so we start at the noon JD of J2000 minus 0.5.
  const JD =
    Math.floor(date.getTime() / 86_400_000) + // days since Unix epoch (1970-01-01)
    2440587.5; // JD of 1970-01-01T00:00:00Z

  // Julian century from J2000.0
  const T = (JD - 2451545.0) / 36525;

  // ---------------------------------------------------------------------------
  // Step 2 — Sun's geometric mean longitude (degrees, J2000 epoch)
  // ---------------------------------------------------------------------------
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;

  // ---------------------------------------------------------------------------
  // Step 3 — Sun's geometric mean anomaly (degrees)
  // ---------------------------------------------------------------------------
  const M = 357.52911 + T * (35999.05029 - T * 0.0001537);

  // ---------------------------------------------------------------------------
  // Step 4 — Equation of the centre
  // ---------------------------------------------------------------------------
  const Mrad = M * DEG;
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  // Sun's true longitude (degrees)
  const sunLon = L0 + C;

  // Sun's apparent longitude (degrees) — correct for nutation & aberration
  const omega = 125.04 - 1934.136 * T;
  const sunAppLon = sunLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // ---------------------------------------------------------------------------
  // Step 5 — Obliquity of the ecliptic (degrees)
  // ---------------------------------------------------------------------------
  const epsilon0 = 23 + (26 + (21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const epsilonCorr = epsilon0 + 0.00256 * Math.cos(omega * DEG);

  // ---------------------------------------------------------------------------
  // Step 6 — Solar declination (degrees)
  // ---------------------------------------------------------------------------
  const declRad = Math.asin(Math.sin(epsilonCorr * DEG) * Math.sin(sunAppLon * DEG));

  // ---------------------------------------------------------------------------
  // Step 7 — Equation of Time (minutes)
  //   Uses the "y" / "e" / "l0" / "m" / "s" approach from NOAA spreadsheet.
  // ---------------------------------------------------------------------------
  const y = Math.tan((epsilonCorr / 2) * DEG) ** 2;
  const sinM = Math.sin(M * DEG);
  const sin2M = Math.sin(2 * M * DEG);
  const cos2L0 = Math.cos(2 * L0 * DEG);
  const sin4L0 = Math.sin(4 * L0 * DEG);
  const eqTime =
    4 *
    RAD *
    (y * Math.sin(2 * L0 * DEG) -
      2 * 0.016708634 * sinM +
      4 * 0.016708634 * y * sinM * cos2L0 -
      0.5 * y * y * sin4L0 -
      1.25 * 0.016708634 * 0.016708634 * sin2M);

  // ---------------------------------------------------------------------------
  // Step 8 — Hour angle at sunrise/sunset (degrees)
  //   NOAA uses 90.833° for the solar zenith angle at sunrise/sunset
  //   (accounts for refraction and the apparent radius of the sun).
  // ---------------------------------------------------------------------------
  const latRad = lat * DEG;
  const cosHA =
    Math.cos(90.833 * DEG) / (Math.cos(latRad) * Math.cos(declRad)) -
    Math.tan(latRad) * Math.tan(declRad);

  // Polar edge cases — cosHA outside [-1, 1]
  if (cosHA > 1) {
    // Sun never rises — polar night
    return {
      sunriseUTC: null,
      sunsetUTC: null,
      dayLengthMin: 0,
      polarDay: false,
      polarNight: true,
    };
  }
  if (cosHA < -1) {
    // Sun never sets — polar day (midnight sun)
    return {
      sunriseUTC: null,
      sunsetUTC: null,
      dayLengthMin: 1440,
      polarDay: true,
      polarNight: false,
    };
  }

  // Hour angle in degrees
  const HA = Math.acos(cosHA) * RAD;

  // ---------------------------------------------------------------------------
  // Step 9 — Sunrise / sunset in minutes past UTC midnight
  //   sunriseUTC  = 720 − 4 * (lng + HA) − eqTime
  //   sunsetUTC   = 720 − 4 * (lng − HA) − eqTime
  // ---------------------------------------------------------------------------
  const sunriseMin = 720 - 4 * (lng + HA) - eqTime;
  const sunsetMin = 720 - 4 * (lng - HA) - eqTime;
  const dayLengthMin = Math.round(sunsetMin - sunriseMin);

  return {
    sunriseUTC: minToHHMM(sunriseMin),
    sunsetUTC: minToHHMM(sunsetMin),
    dayLengthMin,
    polarDay: false,
    polarNight: false,
  };
}
