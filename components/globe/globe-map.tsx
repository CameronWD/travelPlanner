"use client";

/**
 * Leaflet world map for the Globe. Generalises components/trip/wishlist-map.tsx:
 *   - category-coloured divIcon marker per located Marker
 *   - click a pin  -> onSelect(id)
 *   - click the map -> onMapClick(lat, lng)  (drop-a-pin add flow)
 *   - fits bounds to located markers, or shows a whole-world view when none.
 * Client-only; loaded via GlobeMapLoader (ssr:false). See ADR 0024.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { MarkerView } from "@/components/globe/types";

export interface GlobeMapProps {
  markers: MarkerView[];
  onSelect: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
}

const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9",
  FOOD: "#f59e0b",
  ACTIVITY: "#10b981",
  NIGHTLIFE: "#8b5cf6",
  SHOPPING: "#f43f5e",
  OTHER: "#78716c",
};
const pinHex = (c: string) => CATEGORY_HEX[c] ?? CATEGORY_HEX.OTHER;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function categoryIcon(L: typeof import("leaflet"), category: string): import("leaflet").DivIcon {
  const hex = pinHex(category);
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${hex};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">●</div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

export function GlobeMap({ markers, onSelect, onMapClick }: GlobeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // Keep latest callbacks without re-initialising the map.
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  // Update refs in an effect so they're never mutated during render
  // (react-hooks/no-ref-access-during-render compliance).
  useEffect(() => {
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
  });

  // Flips true once the async Leaflet map exists, so the pin-plotting effect
  // below re-runs and actually plots on first load (it otherwise runs once,
  // before the async map is created, and — for a server-loaded Globe whose
  // marker set is stable — never runs again). See plan 2026-07-09.
  const [ready, setReady] = useState(false);

  const located = markers.filter(
    (m): m is MarkerView & { lat: number; lng: number } => m.lat != null && m.lng != null,
  );

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        iconUrl: "/leaflet/marker-icon.png",
        shadowUrl: "/leaflet/marker-shadow.png",
      });
      if (!mapRef.current) return;

      const map = L.map(mapRef.current, { zoomControl: true, worldCopyJump: true });
      leafletMapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      if (located.length > 0) {
        map.fitBounds(L.latLngBounds(located.map((m) => [m.lat, m.lng] as [number, number])), {
          padding: [40, 40],
          maxZoom: 8,
        });
      } else {
        map.setView([20, 0], 2); // whole-world view
      }
      setReady(true);
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever the located set changes.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !ready) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // Clear existing markers (layer group kept on the map instance).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers?.forEach((mk: import("leaflet").Marker) => mk.remove());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers = [];
      for (const mk of located) {
        const marker = L.marker([mk.lat, mk.lng], { icon: categoryIcon(L, mk.category) })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:min(140px,80vw);max-width:min(240px,90vw);line-height:1.5"><strong style="font-size:13px">${escapeHtml(
              mk.title,
            )}</strong></div>`,
          );
        marker.on("click", () => onSelectRef.current(mk.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._globeMarkers.push(marker);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, located.map((m) => `${m.id}:${m.lat},${m.lng}:${m.category}`).join("|")]);

  return (
    <div
      ref={mapRef}
      className="w-full h-56 sm:h-[440px] rounded-2xl overflow-hidden border border-border shadow-sm"
      aria-label="Globe map"
    />
  );
}
