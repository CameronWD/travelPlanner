"use client";

/**
 * Leaflet-powered route map for the trip summary page.
 *
 * Client-only (uses window / DOM). Must be dynamically imported with
 * `{ ssr: false }` from the summary page.
 *
 * Renders:
 *   - OpenStreetMap tile layer
 *   - Numbered circle markers for each stop that has coordinates
 *   - Polyline connecting those stops in order
 *   - Popup per marker (name + date range)
 *   - Falls back gracefully when fewer than 2 stops have coords
 */

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { formatDateRange } from "@/lib/dates";

// Leaflet CSS is imported here; the bundle includes it once.
import "leaflet/dist/leaflet.css";

export interface RouteMapStop {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  arriveDate: string;
  departDate: string;
  /** Resolved hex colour for the chapter this stop belongs to (e.g. "#0ea5e9"). */
  chapterColour?: string | null;
  /** Display name of the chapter this stop belongs to. */
  chapterName?: string | null;
}

export interface RouteMapProps {
  stops: RouteMapStop[];
  /** Height of the map container in px. Defaults to 360. */
  height?: number;
}

/**
 * Escape user-controlled strings before interpolating into Leaflet popup HTML.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

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
    <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Add coordinates to your stops to see the route map.
        </span>
      </div>
      {stops.length > 0 && (
        <ol className="flex flex-col gap-2">
          {stops.map((stop, i) => (
            <li key={stop.id} className="flex items-baseline gap-2 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="font-medium">{stop.name}</span>
              <span className="text-muted-foreground">
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

export function RouteMap({ stops, height = 360 }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // Keep a ref to the Leaflet map instance to clean up on unmount
  // and avoid double-init in React strict mode.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);

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

      // Fix default icon URLs that break under bundlers.
      // We use circleMarker instead of the default icon, so this mainly
      // prevents the "broken tile" icon from ever loading.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        iconUrl: "/leaflet/marker-icon.png",
        shadowUrl: "/leaflet/marker-shadow.png",
      });

      if (!mapRef.current) return;

      map = L.map(mapRef.current, { zoomControl: true });
      leafletMapRef.current = map;

      // Capture as non-nullable consts so TypeScript narrows inside callbacks.
      const lf = L;
      const mapInstance = map;

      // OSM tile layer
      lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(mapInstance);

      // Markers and per-segment polylines
      const DEFAULT_COLOUR = "hsl(221, 83%, 53%)";
      const latlngs: [number, number][] = [];

      coordStops.forEach((stop, index) => {
        latlngs.push([stop.lat, stop.lng]);

        const markerBg = stop.chapterColour ?? DEFAULT_COLOUR;

        // Use a div icon with a number badge
        const icon = lf.divIcon({
          html: `<div style="
            width:28px;height:28px;
            border-radius:50%;
            background:${markerBg};
            color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-size:12px;font-weight:700;font-family:sans-serif;
            border:2px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.3);
          ">${index + 1}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -16],
        });

        const chapterLine = stop.chapterName
          ? `<br/><span style="font-size:11px;color:#888">${escapeHtml(stop.chapterName)}</span>`
          : "";

        const popupContent = `
          <div style="min-width:min(140px,80vw);max-width:min(240px,90vw);line-height:1.4">
            <strong style="font-size:14px">${escapeHtml(stop.name)}</strong>${chapterLine}<br/>
            <span style="font-size:12px;color:#666">
              ${formatDateRange(stop.arriveDate, stop.departDate)}
            </span>
          </div>`;

        lf.marker([stop.lat, stop.lng], { icon })
          .addTo(mapInstance)
          .bindPopup(popupContent);
      });

      // Per-segment polylines — each segment coloured by the destination stop's chapter
      if (latlngs.length >= 2) {
        for (let i = 0; i < latlngs.length - 1; i++) {
          const destStop = coordStops[i + 1];
          const segmentColour = destStop.chapterColour ?? DEFAULT_COLOUR;
          lf.polyline([latlngs[i], latlngs[i + 1]], {
            color: segmentColour,
            weight: 3,
            opacity: 0.7,
            dashArray: "6 4",
          }).addTo(mapInstance);
        }
      }

      // Fit bounds to all markers
      const bounds = lf.latLngBounds(latlngs);
      mapInstance.fitBounds(bounds, { padding: [40, 40] });
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  // The effect re-runs only when the set of plotted coords/colours actually
  // changes; we depend on a derived signature string rather than the `stops`
  // array identity, which exhaustive-deps can't verify — hence the disable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughCoords, stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.chapterColour ?? ""}:${s.chapterName ?? ""}`).join("|")]);

  if (!hasEnoughCoords) {
    return <MapFallback stops={stops} />;
  }

  return (
    <div
      ref={mapRef}
      style={{ height }}
      className="w-full rounded-2xl overflow-hidden border border-border shadow-soft"
      aria-label="Trip route map"
    />
  );
}
