"use client";

/**
 * Leaflet-powered map for a wishlist.
 *
 * Client-only (uses window / DOM). Rendered lazily inside WishlistMapLoader
 * so Leaflet only loads when the map is needed.
 *
 * Renders:
 *   - A category-coloured divIcon marker per wishlist item
 *   - Fits bounds to all items
 *   - On marker click calls props.onSelect(item.id)
 */

import { useEffect, useRef } from "react";

// Leaflet CSS imported here; the bundle includes it once.
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WishlistMapItem {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
}

export interface WishlistMapProps {
  items: WishlistMapItem[];
  onSelect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------

const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9", // sky
  FOOD: "#f59e0b",        // amber
  ACTIVITY: "#10b981",    // emerald
  NIGHTLIFE: "#8b5cf6",   // violet
  SHOPPING: "#f43f5e",    // rose
  OTHER: "#78716c",       // stone
};

const pinHex = (category: string): string =>
  CATEGORY_HEX[category] ?? CATEGORY_HEX.OTHER;

// ---------------------------------------------------------------------------
// Marker style helpers
// ---------------------------------------------------------------------------

/** Escape user-controlled strings before interpolating into Leaflet popup HTML. */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function categoryIcon(
  L: typeof import("leaflet"),
  category: string,
): import("leaflet").DivIcon {
  const hex = pinHex(category);
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;
      border-radius:50%;
      background:${hex};
      color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;font-family:sans-serif;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">●</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WishlistMap({ items, onSelect }: WishlistMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);

  useEffect(() => {
    if (items.length === 0) return;
    if (!mapRef.current) return;
    // Avoid double-init in React strict mode
    if (leafletMapRef.current) return;

    let map: import("leaflet").Map | null = null;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;

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

      const mapInstance = map;

      // OSM tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(mapInstance);

      // Place a marker per wishlist item
      for (const item of items) {
        const icon = categoryIcon(L, item.category);
        const popupHtml = `<div style="min-width:140px;line-height:1.5">
          <strong style="font-size:14px">${escapeHtml(item.title)}</strong>
        </div>`;

        const marker = L.marker([item.lat, item.lng], { icon })
          .addTo(mapInstance)
          .bindPopup(popupHtml);

        // Primary contract: click on marker calls onSelect
        marker.on("click", () => {
          onSelect(item.id);
        });
      }

      // Fit bounds to all items
      const allLatLngs: [number, number][] = items.map((p) => [p.lat, p.lng]);
      const bounds = L.latLngBounds(allLatLngs);
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
    items.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    items.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);

  if (items.length === 0) return null;

  return (
    <div
      ref={mapRef}
      style={{ height: 360 }}
      className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
      aria-label="Wishlist map"
    />
  );
}
