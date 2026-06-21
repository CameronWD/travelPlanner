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
}

export interface RouteMapProps {
  stops: RouteMapStop[];
  /** Height of the map container in px. Defaults to 360. */
  height?: number;
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
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapRef.current) return;

      map = L.map(mapRef.current, { zoomControl: true });
      leafletMapRef.current = map;

      // OSM tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      // Markers and polyline
      const latlngs: [number, number][] = [];

      coordStops.forEach((stop, index) => {
        latlngs.push([stop.lat, stop.lng]);

        // Use a div icon with a number badge
        const icon = L!.divIcon({
          html: `<div style="
            width:28px;height:28px;
            border-radius:50%;
            background:hsl(var(--primary, 221 83% 53%));
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

        const popupContent = `
          <div style="min-width:140px;line-height:1.4">
            <strong style="font-size:14px">${stop.name}</strong><br/>
            <span style="font-size:12px;color:#666">
              ${formatDateRange(stop.arriveDate, stop.departDate)}
            </span>
          </div>`;

        L!.marker([stop.lat, stop.lng], { icon })
          .addTo(map!)
          .bindPopup(popupContent);
      });

      // Polyline
      if (latlngs.length >= 2) {
        L.polyline(latlngs, {
          color: "hsl(221, 83%, 53%)",
          weight: 3,
          opacity: 0.7,
          dashArray: "6 4",
        }).addTo(map);
      }

      // Fit bounds to all markers
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [40, 40] });
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughCoords, stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|")]);

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
