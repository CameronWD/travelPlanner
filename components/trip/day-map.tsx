"use client";

/**
 * Leaflet-powered map for a single day's itinerary.
 *
 * Client-only (uses window / DOM). Rendered lazily inside DayMapPanel
 * so Leaflet only loads when the panel is opened.
 *
 * Renders:
 *   - Numbered markers for itinerary items (kind="item")
 *   - A distinct "H" marker for accommodation
 *   - A distinct "T" marker for transport departure / arrival
 *   - A polyline through routePoints in order
 *   - Per-marker popups with "Open in Maps" and optional "Directions from previous"
 *   - An "Open today's route" control when ≥2 routePoints exist
 */

import { useEffect, useRef } from "react";
import type { DayMapModel, DayMapPoint } from "@/lib/day-map";
import {
  mapsUrl,
  appleMapsUrl,
  googleDirectionsUrl,
  appleDirectionsUrl,
} from "@/lib/maps";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { escapeHtml } from "@/lib/escape-html";
import { applyLeafletIconDefaults } from "@/lib/map-icons";
import { pinHtml, pinSize } from "@/lib/map-pins";

// Leaflet CSS imported here; the bundle includes it once.
import "leaflet/dist/leaflet.css";

export type { DayMapModel };

// ---------------------------------------------------------------------------
// Marker style helpers
// ---------------------------------------------------------------------------

function itemIcon(
  L: typeof import("leaflet"),
  order: number,
): import("leaflet").DivIcon {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;
      border-radius:50%;
      background:#2563eb;
      color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;font-family:sans-serif;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${order}</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Converted to `pinHtml` (variant "home"): the hand-rolled version put white
// text on a #0d9488 fill, measuring 3.74:1 against the 4.5:1 AA text requires
// -- one of the map-pin contrast failures the full-app audit found. `pinHtml`'s
// "home" variant keeps the distinct rounded-square shape (vs. the circular
// item pins) but swaps to an ink/paper pair that clears AA in both themes.
function accommodationIcon(L: typeof import("leaflet"), dark: boolean): import("leaflet").DivIcon {
  const size = pinSize("home");
  return L.divIcon({
    html: pinHtml({ variant: "home", label: "H", dark }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

function transportIcon(L: typeof import("leaflet")): import("leaflet").DivIcon {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;
      border-radius:4px;
      background:#7c3aed;
      color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;font-family:sans-serif;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">T</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// ---------------------------------------------------------------------------
// Popup builders
// ---------------------------------------------------------------------------

function buildPopupHtml(
  point: DayMapPoint,
  prev: DayMapPoint | undefined,
): string {
  const googlePlace = mapsUrl({ lat: point.lat, lng: point.lng, label: point.label });
  const applePlace = appleMapsUrl({ lat: point.lat, lng: point.lng, label: point.label });

  const openInMapsHtml =
    googlePlace || applePlace
      ? `<div style="margin-top:6px;font-size:12px;display:flex;gap:8px;flex-wrap:wrap">
          ${googlePlace ? `<a href="${escapeHtml(googlePlace)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">Google Maps</a>` : ""}
          ${applePlace ? `<a href="${escapeHtml(applePlace)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">Apple Maps</a>` : ""}
        </div>`
      : "";

  let directionsHtml = "";
  if (point.kind === "item" && prev) {
    const gDir = googleDirectionsUrl([prev, point]);
    const aDir = appleDirectionsUrl([prev, point]);
    if (gDir || aDir) {
      directionsHtml = `<div style="margin-top:4px;font-size:12px;display:flex;gap:8px;flex-wrap:wrap">
        <span style="color:#888">Directions from previous:</span>
        ${gDir ? `<a href="${escapeHtml(gDir)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">Google</a>` : ""}
        ${aDir ? `<a href="${escapeHtml(aDir)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">Apple</a>` : ""}
      </div>`;
    }
  }

  return `<div style="min-width:min(160px,80vw);max-width:min(260px,90vw);line-height:1.5">
    <strong style="font-size:14px">${escapeHtml(point.label)}</strong>
    ${openInMapsHtml}
    ${directionsHtml}
  </div>`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DayMap({
  tripId,
  model,
}: {
  tripId: string;
  model: DayMapModel;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);
  // Ref map: `${kind}:${id}` → Leaflet Marker instance, so a theme flip can
  // recolour markers in place (setIcon). Keyed on kind+id rather than just id
  // because a single Transport row can produce both a transport-dep and a
  // transport-arr point sharing the same underlying id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerInstancesRef = useRef<Map<string, any>>(new Map());

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { points, routePoints, perItemPrev } = model;

  useEffect(() => {
    if (points.length === 0) return;
    if (!mapRef.current) return;
    // Avoid double-init in React strict mode
    if (leafletMapRef.current) return;

    let L: typeof import("leaflet") | null = null;
    let map: import("leaflet").Map | null = null;

    import("leaflet").then((leaflet) => {
      L = leaflet.default ?? leaflet;

      applyLeafletIconDefaults(L);

      if (!mapRef.current) return;

      map = L.map(mapRef.current, { zoomControl: true });
      leafletMapRef.current = map;

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

      // Place markers for all points
      markerInstancesRef.current.clear();
      for (const point of points) {
        let icon: import("leaflet").DivIcon;
        if (point.kind === "item") {
          icon = itemIcon(lf, point.order ?? 1);
        } else if (point.kind === "accommodation") {
          icon = accommodationIcon(lf, isDark);
        } else {
          icon = transportIcon(lf);
        }

        const prev = point.kind === "item" ? perItemPrev[point.id] : undefined;
        const popupHtml = buildPopupHtml(point, prev);

        const marker = lf.marker([point.lat, point.lng], { icon })
          .addTo(mapInstance)
          .bindPopup(popupHtml);
        markerInstancesRef.current.set(`${point.kind}:${point.id}`, marker);
      }

      // Polyline through routePoints in order
      if (routePoints.length >= 2) {
        const latlngs: [number, number][] = routePoints.map((p) => [p.lat, p.lng]);
        lf.polyline(latlngs, {
          color: "#2563eb",
          weight: 3,
          opacity: 0.7,
          dashArray: "6 4",
        }).addTo(mapInstance);
      }

      // Fit bounds to all points
      const allLatLngs: [number, number][] = points.map((p) => [p.lat, p.lng]);
      const bounds = lf.latLngBounds(allLatLngs);
      mapInstance.fitBounds(bounds, { padding: [40, 40] });
    });

    const markerInstances = markerInstancesRef.current;
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      markerInstances.clear();
    };
    // `isDark` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so depending on the theme would rebuild it (losing pan/zoom) on
    // every toggle. The separate setUrl effect below swaps tiles in place, and
    // the recolour effect below that updates marker icons in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    points.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    points.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);

  // Swap basemap tiles when the theme flips, without rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
  }, [isDark]);

  // Recolour the accommodation marker in place when the theme flips. Uses
  // `setIcon` rather than remove-and-recreate, so a currently-open popup and
  // the viewport (pan/zoom) are both left alone. `itemIcon`/`transportIcon`
  // aren't theme-aware (they measured/computed as passing contrast either
  // way, so weren't converted -- see the task report), so only the
  // accommodation point needs a live update here.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      for (const point of points) {
        if (point.kind !== "accommodation") continue;
        const instance = markerInstancesRef.current.get(`${point.kind}:${point.id}`);
        instance?.setIcon(accommodationIcon(L, isDark));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, points.map((p) => `${p.kind}:${p.id}`).join("|")]);

  if (points.length === 0) return null;

  // "Open today's route" control
  const googleRouteUrl = googleDirectionsUrl(routePoints);
  const appleRouteUrl = appleDirectionsUrl(routePoints);
  const hasRouteLinks = googleRouteUrl || appleRouteUrl;

  return (
    <div className="flex flex-col gap-2">
      {hasRouteLinks && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground font-medium">Open today&apos;s route:</span>
          {googleRouteUrl && (
            <a
              href={googleRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Google Maps
            </a>
          )}
          {appleRouteUrl && (
            <a
              href={appleRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Apple Maps
            </a>
          )}
        </div>
      )}
      <div
        ref={mapRef}
        style={{ height: 360 }}
        className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
        aria-label={`Day route map for trip ${tripId}`}
      />
    </div>
  );
}
