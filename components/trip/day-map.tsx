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

// Leaflet CSS imported here; the bundle includes it once.
import "leaflet/dist/leaflet.css";

export type { DayMapModel };

/** Escape user-controlled strings before interpolating into Leaflet popup HTML. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

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

function accommodationIcon(L: typeof import("leaflet")): import("leaflet").DivIcon {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;
      border-radius:6px;
      background:#0d9488;
      color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;font-family:sans-serif;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">H</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
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

      // Fix default icon URLs that break under bundlers.
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

      const lf = L;
      const mapInstance = map;

      // OSM tile layer
      lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(mapInstance);

      // Place markers for all points
      for (const point of points) {
        let icon: import("leaflet").DivIcon;
        if (point.kind === "item") {
          icon = itemIcon(lf, point.order ?? 1);
        } else if (point.kind === "accommodation") {
          icon = accommodationIcon(lf);
        } else {
          icon = transportIcon(lf);
        }

        const prev = point.kind === "item" ? perItemPrev[point.id] : undefined;
        const popupHtml = buildPopupHtml(point, prev);

        lf.marker([point.lat, point.lng], { icon })
          .addTo(mapInstance)
          .bindPopup(popupHtml);
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

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    points.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    points.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);

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
