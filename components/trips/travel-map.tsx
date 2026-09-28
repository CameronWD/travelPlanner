"use client";

/**
 * "Your travels" — the Travel map (TRIPS_PAGE.md §5, §8; CONTEXT.md "Your
 * travels", "Trip colour"). Every trip's located Stops as 20px pins (14px on
 * mobile) in the trip's own hue, legs joined by a dashed ink line. Never a
 * leg from the Home base (the loader never includes it). Done trips draw at
 * full opacity.
 *
 * NEVER "Globe" — that's the separate, cross-trip places-you-want-to-go map
 * (components/globe/globe-map.tsx). This is personal, derived, and shows
 * only real-plan Trips the Traveller is actually on.
 *
 * Client-only (Leaflet touches the DOM); loaded via TravelMapLoader
 * (ssr:false), matching components/trip/route-map.tsx / components/globe/
 * globe-map.tsx.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { applyLeafletIconDefaults } from "@/lib/map-icons";
import { pinHtml } from "@/lib/map-pins";
import { hueHex, mapInk } from "@/lib/map-palette";
import type { Hue } from "@/lib/hues";

export interface TravelMapPoint {
  lat: number;
  lng: number;
  name: string;
}

export type TravelWhen = "past" | "now" | "upcoming";

export interface TravelMapTrip {
  id: string;
  name: string;
  hue: Hue;
  when: TravelWhen;
  points: TravelMapPoint[];
}

export interface TravelMapProps {
  trips: TravelMapTrip[];
  /** null = every trip. */
  filterTripId: string | null;
  variant: "desktop" | "mobile";
  /** Called once if Leaflet fails to load or the map fails to build. */
  onFail?: () => void;
}

const WORLD: [[number, number], number] = [[20, 0], 1];

function pointIcon(L: typeof import("leaflet"), hue: Hue, dark: boolean, size: number, desktop: boolean) {
  return L.divIcon({
    html: pinHtml({ variant: "stop", fill: hueHex(hue, dark), dark, size, shadow: desktop }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * "Your travels" map (TRIPS_PAGE.md §5, §8; CONTEXT.md "Your travels", "Trip
 * colour"): every trip's located Stops as 20px pins (14px on mobile) in the
 * trip's colour, legs joined by a dashed ink line. Never a leg from the Home
 * base (the loader never includes it). Done trips draw at full opacity.
 */
export function TravelMap({ trips, filterTripId, variant, onFail }: TravelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<{ L: typeof import("leaflet"); layers: any[] } | null>(null);
  /** `${filterTripId}|${dataKey}` as of the last fit — a theme-only redraw must not re-fit. */
  const lastFitKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const pin = variant === "mobile" ? 14 : 20;
  const shown = filterTripId ? trips.filter((t) => t.id === filterTripId) : trips;
  const dataKey = shown.map((t) => `${t.id}:${t.hue}:${t.points.length}`).join("|");

  // Build once. Does NOT draw — that's the redraw effect's job below, so the
  // first draw always sees the render's current props instead of whatever
  // was current when the async `import("leaflet")` was kicked off.
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    import("leaflet")
      .then((leaflet) => {
        try {
          const L = leaflet.default ?? leaflet;
          applyLeafletIconDefaults(L);
          if (!mapRef.current) return;
          const map = L.map(mapRef.current, {
            zoomControl: false,
            scrollWheelZoom: false,
            dragging: true,
            attributionControl: false,
            worldCopyJump: false,
            maxBounds: [
              [-85, -180],
              [85, 180],
            ],
            maxBoundsViscosity: 1,
            minZoom: 1,
          });
          leafletMapRef.current = map;
          const tiles = cartoTiles(isDark);
          tileLayerRef.current = L
            .tileLayer(tiles.url, { subdomains: tiles.subdomains, maxZoom: tiles.maxZoom, noWrap: true })
            .addTo(map);
          overlaysRef.current = { L, layers: [] };
          setReady(true);
        } catch {
          onFail?.();
        }
      })
      .catch(() => {
        onFail?.();
      });
    return () => {
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      overlaysRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const map = leafletMapRef.current;
    const o = overlaysRef.current;
    if (!map || !o) return;
    for (const layer of o.layers) layer.remove();
    o.layers = [];
    const k = mapInk(isDark);
    const desktop = variant === "desktop";
    const all: [number, number][] = [];
    for (const trip of shown) {
      const latlngs = trip.points.map((p) => [p.lat, p.lng] as [number, number]);
      all.push(...latlngs);
      if (latlngs.length >= 2) {
        o.layers.push(o.L.polyline(latlngs, { color: k.ink, weight: 1.5, opacity: 1, dashArray: "6 5" }).addTo(map));
      }
      for (const [lat, lng] of latlngs) {
        o.layers.push(o.L.marker([lat, lng], { icon: pointIcon(o.L, trip.hue, isDark, pin, desktop), keyboard: false }).addTo(map));
      }
    }
    // Pan/zoom must survive a theme-only toggle — only re-fit when the
    // filter or the underlying data actually changed.
    const fitKey = `${filterTripId}|${dataKey}`;
    if (lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      if (all.length > 0) {
        map.fitBounds(o.L.latLngBounds(all), { padding: [40, 40] });
        if (map.getZoom() < 1) map.setZoom(1);
      } else {
        map.setView(...WORLD);
      }
    }
  }

  // Redraw on data / filter / theme change (theme swaps tiles in place; the map is never rebuilt).
  useEffect(() => {
    if (!ready || !leafletMapRef.current) return;
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isDark, filterTripId, dataKey, pin]);

  return <div ref={mapRef} className="tp-map absolute inset-0 bg-map-fill" aria-label="Your travels map" />;
}
