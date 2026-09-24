"use client";

/**
 * Leaflet-powered route map for the trip summary page.
 *
 * Client-only (uses window / DOM). Must be dynamically imported with
 * `{ ssr: false }` from the summary page.
 *
 * Renders:
 *   - CARTO tile layer (Positron / Dark Matter)
 *   - Numbered kit sticker pins (pinHtml "stop") in the chapter colour, and a
 *     pinHtml "home" pin for the home base — recoloured in place on theme flip
 *   - Polyline connecting those stops in order
 *   - Kit popup per marker (.tp-map-popup shell, token classes only)
 *   - Falls back gracefully when fewer than 2 stops have coords
 */

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { formatDateRange } from "@/lib/dates";
import type { HomeMapPoint } from "@/lib/route-map";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { escapeHtml } from "@/lib/escape-html";
import { applyLeafletIconDefaults } from "@/lib/map-icons";
import { pinHtml, pinSize } from "@/lib/map-pins";
import { mapInk, routeStyles } from "@/lib/map-palette";
import { CHAPTER_COLOURS } from "@/lib/chapter-colours";

// Leaflet CSS is imported here; the bundle includes it once.
import "leaflet/dist/leaflet.css";

export interface RouteMapStop {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  arriveDate: string;
  departDate: string;
  /** chapterColourSwatch(value) for the stop's chapter; the dark swatch is derived in dark mode. */
  chapterColour?: string | null;
  /** Display name of the chapter this stop belongs to. */
  chapterName?: string | null;
}

export interface RouteMapProps {
  stops: RouteMapStop[];
  /** Height of the map container in px. Defaults to 360. */
  height?: number;
  /** Optional home base point to render as a bookend pin. */
  home?: HomeMapPoint | null;
  /** When true and home is set, also draw a return leg from last stop → home. */
  showReturn?: boolean;
}

/**
 * Callers pass the chapter's light swatch (chapterColourSwatch(value)); map it
 * back through the chapter palette so dark mode gets the dark swatch. An
 * unknown colour is used as-is; no chapter → undefined (pinHtml's neutral fill).
 */
function stopFill(colour: string | null | undefined, dark: boolean): string | undefined {
  if (!colour) return undefined;
  const c = colour.toLowerCase();
  const meta = CHAPTER_COLOURS.find(
    (m) => m.swatch.toLowerCase() === c || m.swatchDark.toLowerCase() === c,
  );
  return meta ? (dark ? meta.swatchDark : meta.swatch) : colour;
}

function stopIcon(L: typeof import("leaflet"), n: number, colour: string | null | undefined, dark: boolean) {
  const size = pinSize("stop");
  return L.divIcon({
    html: pinHtml({ variant: "stop", fill: stopFill(colour, dark), label: String(n), dark }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

// Same "home" pin (ink rounded square, "H") the Day map uses for the stay.
function homeIcon(L: typeof import("leaflet"), dark: boolean) {
  const size = pinSize("home");
  return L.divIcon({
    html: pinHtml({ variant: "home", label: "H", dark }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

/** Leg colour: the destination's chapter, else the muted ink (visible on both tile sets). */
function legColour(colour: string | null | undefined, dark: boolean): string {
  return stopFill(colour, dark) ?? mapInk(dark).muted;
}

const homeLegColour = (dark: boolean) => routeStyles(dark).returnLeg.color;

// Token classes only (Tailwind scans this file) so popups follow the theme;
// the .tp-map-popup shell in globals.css supplies the kit outline + shadow.
const POPUP = { className: "tp-map-popup" } as const;

/**
 * Stops that have valid coordinates.
 */
function stopsWithCoords(
  stops: RouteMapStop[],
): (RouteMapStop & { lat: number; lng: number })[] {
  return stops.filter(
    (s): s is RouteMapStop & { lat: number; lng: number } =>
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      !isNaN(s.lat) &&
      !isNaN(s.lng),
  );
}

// ---------------------------------------------------------------------------
// Fallback — shown when there aren't enough coords to draw a map
// ---------------------------------------------------------------------------

function MapFallback({ stops }: { stops: RouteMapStop[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border-2 border-dashed border-border-soft px-5 py-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Add coordinates to your stops to see the route map.
        </span>
      </div>
      {stops.length > 0 && (
        <ol className="flex flex-col gap-2">
          {stops.map((stop, i) => (
            <li key={stop.id} className="flex items-baseline gap-2 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-[10px] font-extrabold tabular-nums text-foreground">
                {i + 1}
              </span>
              <span className="font-bold">{stop.name}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {formatDateRange(stop.arriveDate, stop.departDate)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map component
// ---------------------------------------------------------------------------

export function RouteMap({ stops, height = 360, home = null, showReturn = false }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the Leaflet map instance to clean up on unmount
  // and avoid double-init in React strict mode.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  // Markers + legs, so a theme flip can recolour them without rebuilding the map.
  const overlaysRef = useRef<{
    L: typeof import("leaflet");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stopMarkers: { marker: any; n: number; colour: string | null | undefined }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    homeMarker: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    legs: { line: any; colour: string | null | undefined; home: boolean }[];
  } | null>(null);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const coordStops = stopsWithCoords(stops);
  const hasEnoughCoords = coordStops.length >= 2;

  useEffect(() => {
    if (!hasEnoughCoords) return;
    if (!mapRef.current) return;

    // Avoid double-init (React strict mode calls effects twice)
    if (leafletMapRef.current) return;

    // Dynamic import keeps Leaflet out of the SSR bundle entirely.
    // (The parent page also uses ssr:false, but this is belt-and-suspenders.)
    let L: typeof import("leaflet") | null = null;
    let map: import("leaflet").Map | null = null;

    import("leaflet").then((leaflet) => {
      L = leaflet.default ?? leaflet;

      applyLeafletIconDefaults(L);

      if (!mapRef.current) return;

      map = L.map(mapRef.current, { zoomControl: true });
      leafletMapRef.current = map;

      // Capture as non-nullable consts so TypeScript narrows inside callbacks.
      const lf = L;
      const mapInstance = map;

      // CARTO basemap tiles (Positron / Dark Matter), theme-aware.
      const tiles = cartoTiles(isDark);
      tileLayerRef.current = lf
        .tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
        })
        .addTo(mapInstance);

      // Markers and per-segment polylines
      const latlngs: [number, number][] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stopMarkers: { marker: any; n: number; colour: string | null | undefined }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legs: { line: any; colour: string | null | undefined; home: boolean }[] = [];

      coordStops.forEach((stop, index) => {
        latlngs.push([stop.lat, stop.lng]);

        const chapterLine = stop.chapterName
          ? `<span class="block text-xs font-semibold text-muted-foreground">${escapeHtml(stop.chapterName)}</span>`
          : "";

        const popupContent = `
          <div class="min-w-[min(140px,80vw)] max-w-[min(240px,90vw)] leading-normal">
            <strong class="block font-display text-sm font-extrabold">${escapeHtml(stop.name)}</strong>${chapterLine}
            <span class="block text-xs font-medium text-muted-foreground">${formatDateRange(stop.arriveDate, stop.departDate)}</span>
          </div>`;

        const marker = lf
          .marker([stop.lat, stop.lng], { icon: stopIcon(lf, index + 1, stop.chapterColour, isDark) })
          .addTo(mapInstance)
          .bindPopup(popupContent, POPUP);
        stopMarkers.push({ marker, n: index + 1, colour: stop.chapterColour });
      });

      // Per-segment polylines — each segment coloured by the destination stop's chapter
      if (latlngs.length >= 2) {
        for (let i = 0; i < latlngs.length - 1; i++) {
          const destStop = coordStops[i + 1];
          const line = lf.polyline([latlngs[i], latlngs[i + 1]], {
            color: legColour(destStop.chapterColour, isDark),
            weight: 3,
            opacity: 0.7,
            dashArray: "6 4",
          });
          line.addTo(mapInstance);
          legs.push({ line, colour: destStop.chapterColour, home: false });
        }
      }

      // Home base marker + bookend polylines
      // VISUAL: these changes (home marker, outbound/return dashed polylines)
      // require human browser verification — they cannot be asserted in tests.
      const allLatLngs: [number, number][] = [...latlngs];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let homeMarker: any = null;
      if (home) {
        const homeLatLng: [number, number] = [home.lat, home.lng];
        allLatLngs.push(homeLatLng);

        homeMarker = lf
          .marker(homeLatLng, { icon: homeIcon(lf, isDark) })
          .addTo(mapInstance)
          .bindPopup(
            `<div class="min-w-[min(120px,80vw)] max-w-[min(200px,90vw)] leading-normal">
              <strong class="block font-display text-sm font-extrabold">${escapeHtml(home.name)}</strong>
              <span class="block text-xs font-medium text-muted-foreground">Home base</span>
            </div>`,
            POPUP,
          );

        const homeLeg = (a: [number, number], b: [number, number]) => {
          const line = lf.polyline([a, b], {
            color: homeLegColour(isDark),
            weight: 2,
            opacity: 0.5,
            dashArray: "8 5",
          });
          line.addTo(mapInstance);
          legs.push({ line, colour: null, home: true });
        };

        // Outbound leg: home → first stop
        if (coordStops.length >= 1) homeLeg(homeLatLng, latlngs[0]);

        // Return leg: last stop → home (only when showReturn)
        if (showReturn && coordStops.length >= 1) homeLeg(latlngs[latlngs.length - 1], homeLatLng);
      }

      overlaysRef.current = { L: lf, stopMarkers, homeMarker, legs };

      // Fit bounds to all markers (including home if present)
      const bounds = lf.latLngBounds(allLatLngs);
      mapInstance.fitBounds(bounds, { padding: [40, 40] });
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      overlaysRef.current = null;
    };
  // The effect re-runs only when the set of plotted coords/colours actually
  // changes; we depend on a derived signature string rather than the `stops`
  // array identity, which exhaustive-deps can't verify — hence the disable.
  // `isDark` is deliberately absent: this effect's cleanup destroys the map, so
  // depending on the theme would rebuild it (losing pan/zoom) on every toggle.
  // The separate setUrl effect below swaps tiles in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughCoords, stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.chapterColour ?? ""}:${s.chapterName ?? ""}`).join("|"), home?.lat, home?.lng, home?.name, showReturn]);

  // Swap basemap tiles and recolour pins/legs when the theme flips, without
  // rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
    const o = overlaysRef.current;
    if (!o) return;
    for (const { marker, n, colour } of o.stopMarkers) marker.setIcon(stopIcon(o.L, n, colour, isDark));
    o.homeMarker?.setIcon(homeIcon(o.L, isDark));
    for (const { line, colour, home: isHome } of o.legs) {
      line.setStyle({ color: isHome ? homeLegColour(isDark) : legColour(colour, isDark) });
    }
  }, [isDark]);

  if (!hasEnoughCoords) {
    return <MapFallback stops={stops} />;
  }

  return (
    <div
      ref={mapRef}
      style={{ height }}
      className="tp-map w-full overflow-hidden rounded-lg border-2 border-border shadow-hard-2"
      aria-label="Trip route map"
    />
  );
}
