"use client";

/**
 * "Your travels" — the Travel map (spec §M, CONTEXT.md "Your travels").
 * Every Trip the Traveller is on, drawn as its route of located Stops,
 * coloured by phase (past / now / upcoming — lib/map-palette's
 * `travelPhaseHex`, the only place hex may go), upcoming legs dashed. Click
 * any point on a Trip's route -> popup with its name, dates, and "Home" /
 * "Plan" links.
 *
 * NEVER "Globe" — that's the separate, cross-trip places-you-want-to-go map
 * (components/globe/globe-map.tsx). This is personal, derived, and shows
 * only real-plan Trips the Traveller is actually on.
 *
 * Client-only (Leaflet touches the DOM); loaded via TravelMapLoader
 * (ssr:false), matching components/trip/route-map.tsx / components/globe/
 * globe-map.tsx.
 */

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { escapeHtml } from "@/lib/escape-html";
import { applyLeafletIconDefaults } from "@/lib/map-icons";
import { pinHtml } from "@/lib/map-pins";
import { travelPhaseHex } from "@/lib/map-palette";

export interface TravelMapPoint {
  lat: number;
  lng: number;
  name: string;
}

export type TravelWhen = "past" | "now" | "upcoming";

export interface TravelMapTrip {
  id: string;
  name: string;
  dateLabel: string;
  when: TravelWhen;
  points: TravelMapPoint[];
}

export interface TravelMapProps {
  trips: TravelMapTrip[];
}

/** Small route-point dot, coloured by the Trip's phase. */
function pointIcon(L: typeof import("leaflet"), when: TravelWhen, dark: boolean): import("leaflet").DivIcon {
  const size = 14;
  return L.divIcon({
    html: pinHtml({ variant: "stop", fill: travelPhaseHex(when, dark), dark, size }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

const POPUP = { className: "tp-map-popup" } as const;

function popupHtml(trip: TravelMapTrip): string {
  return `
    <div class="min-w-[min(160px,80vw)] max-w-[min(260px,90vw)] leading-normal">
      <strong class="block font-display text-sm font-extrabold">${escapeHtml(trip.name)}</strong>
      <span class="block text-xs font-medium text-muted-foreground">${escapeHtml(trip.dateLabel)}</span>
      <div class="mt-1.5 flex gap-1.5">
        <a href="/trips/${escapeHtml(trip.id)}" class="inline-flex h-11 items-center rounded-full border-2 border-border bg-card px-4 text-xs font-extrabold text-foreground shadow-hard-1">Home</a>
        <a href="/trips/${escapeHtml(trip.id)}/plan" class="inline-flex h-11 items-center rounded-full border-2 border-border bg-card px-4 text-xs font-extrabold text-foreground shadow-hard-1">Plan</a>
      </div>
    </div>`;
}

export function TravelMap({ trips }: TravelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  const overlaysRef = useRef<{
    L: typeof import("leaflet");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markers: { marker: any; when: TravelWhen }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: { line: any; when: TravelWhen }[];
  } | null>(null);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Only Trips with at least one located point draw anything (trips with no
  // located Stops are omitted — spec §M).
  const located = trips.filter((t) => t.points.length > 0);

  useEffect(() => {
    if (located.length === 0) return;
    if (!mapRef.current) return;
    if (leafletMapRef.current) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      applyLeafletIconDefaults(L);
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
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
        .tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
          noWrap: true,
        })
        .addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markers: { marker: any; when: TravelWhen }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lines: { line: any; when: TravelWhen }[] = [];
      const allLatLngs: [number, number][] = [];

      for (const trip of located) {
        const latlngs: [number, number][] = trip.points.map((p) => [p.lat, p.lng]);
        allLatLngs.push(...latlngs);

        if (latlngs.length >= 2) {
          const line = L.polyline(latlngs, {
            color: travelPhaseHex(trip.when, isDark),
            weight: 3,
            opacity: trip.when === "past" ? 0.7 : 1,
            dashArray: trip.when === "upcoming" ? "6 6" : undefined,
          });
          line.addTo(map);
          lines.push({ line, when: trip.when });
        }

        const html = popupHtml(trip);
        for (const point of trip.points) {
          const marker = L.marker([point.lat, point.lng], { icon: pointIcon(L, trip.when, isDark) })
            .addTo(map)
            .bindPopup(html, POPUP);
          markers.push({ marker, when: trip.when });
        }
      }

      overlaysRef.current = { L, markers, lines };

      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
        if (map.getZoom() < 1) map.setZoom(1);
      }
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      overlaysRef.current = null;
    };
    // `isDark` is deliberately NOT a dependency: this effect's cleanup
    // destroys the map, so depending on the theme would rebuild it (losing
    // pan/zoom) on every toggle. The separate setUrl/recolour effect below
    // swaps tiles + overlay colours in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((t) => `${t.id}:${t.when}:${t.points.map((p) => `${p.lat},${p.lng}`).join(",")}`).join("|")]);

  // Swap basemap tiles and recolour points/lines when the theme flips, without rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
    const o = overlaysRef.current;
    if (!o) return;
    for (const { marker, when } of o.markers) marker.setIcon(pointIcon(o.L, when, isDark));
    for (const { line, when } of o.lines) line.setStyle({ color: travelPhaseHex(when, isDark) });
  }, [isDark]);

  if (located.length === 0) return null;

  return (
    <div
      ref={mapRef}
      className="tp-map h-[260px] w-full overflow-hidden rounded-lg border-2 border-border shadow-hard-2 lg:h-[420px]"
      aria-label="Your travels map"
    />
  );
}
