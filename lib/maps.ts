/**
 * Pure map/directions URL builders.
 *
 * No React, no network — fully unit-testable.
 */

export interface MapLinkParams {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string | null;
}

/**
 * Build a Google Maps search URL.
 *
 * Preference order:
 *   1. lat + lng → `?query=<lat>,<lng>`
 *   2. address   → `?query=<encoded address>`
 *   3. label     → `?query=<encoded label>`
 *
 * Returns null if none of the above are available.
 */
export function mapsUrl({ lat, lng, address, label }: MapLinkParams): string | null {
  const base = "https://www.google.com/maps/search/?api=1&query=";

  if (lat != null && lng != null) {
    return `${base}${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const text = address || label;
  if (text) {
    return `${base}${encodeURIComponent(text)}`;
  }

  return null;
}

/**
 * Build an Apple Maps URL.
 *
 * Preference order:
 *   1. lat + lng → `?ll=<lat>,<lng>&q=<label or coords>`
 *   2. address   → `?q=<encoded address>`
 *   3. label     → `?q=<encoded label>`
 *
 * Returns null if none of the above are available.
 */
export function appleMapsUrl({ lat, lng, address, label }: MapLinkParams): string | null {
  const base = "https://maps.apple.com/";

  if (lat != null && lng != null) {
    const q = label || `${lat},${lng}`;
    return `${base}?ll=${encodeURIComponent(`${lat},${lng}`)}&q=${encodeURIComponent(q)}`;
  }

  const text = address || label;
  if (text) {
    return `${base}?q=${encodeURIComponent(text)}`;
  }

  return null;
}
