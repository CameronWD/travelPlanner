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
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";

export interface GlobeMapProps {
  markers: MarkerView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  attachmentsByMarkerId?: Record<string, { id: string }[]>;
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

function selectedIcon(L: typeof import("leaflet"), category: string): import("leaflet").DivIcon {
  const hex = pinHex(category);
  return L.divIcon({
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${hex};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:3px solid #fff;box-shadow:0 0 0 2px ${hex},0 4px 12px rgba(0,0,0,0.4)">●</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -19],
  });
}

export function GlobeMap({ markers, selectedId, onSelect, onEdit, onDelete, onMapClick, attachmentsByMarkerId }: GlobeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileLayerRef = useRef<any>(null);

  const { theme } = useTheme();
  const isDark = theme === "dark";
  // Keep latest callbacks without re-initialising the map.
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const onEditRef = useRef(onEdit);
  const onDeleteRef = useRef(onDelete);
  // Update refs in an effect so they're never mutated during render
  // (react-hooks/no-ref-access-during-render compliance).
  useEffect(() => {
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
    onEditRef.current = onEdit;
    onDeleteRef.current = onDelete;
  });

  // Ref map: markerId → Leaflet Marker instance, for fly-to / highlight / popup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerInstancesRef = useRef<Map<string, any>>(new Map());

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

      // CARTO basemap tiles (Positron / Dark Matter), theme-aware.
      const tiles = cartoTiles(isDark);
      tileLayerRef.current = L
        .tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
        })
        .addTo(map);

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
  }, [isDark]);

  // Swap basemap tiles when the theme flips, without rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
  }, [isDark]);

  // Re-render markers whenever the located set changes.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !ready) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // Clear existing markers and the id→instance map.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers?.forEach((mk: import("leaflet").Marker) => mk.remove());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._globeMarkers = [];
      markerInstancesRef.current.clear();

      for (const mk of located) {
        const isSelected = mk.id === selectedId;
        const icon = isSelected ? selectedIcon(L, mk.category) : categoryIcon(L, mk.category);
        const attachCount = attachmentsByMarkerId?.[mk.id]?.length ?? 0;
        const attachLine = attachCount > 0
          ? `<p style="font-size:12px;color:#6b7280;margin:0 0 4px">📎 ${attachCount}</p>`
          : "";
        const popupHtml = `
          <div style="min-width:min(140px,80vw);max-width:min(240px,90vw);line-height:1.5">
            <strong style="font-size:13px;display:block;margin-bottom:6px">${escapeHtml(mk.title)}</strong>
            ${attachLine}
            <div style="display:flex;gap:6px;margin-top:4px">
              <button data-edit="${escapeHtml(mk.id)}" style="font-size:12px;padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;background:#fff">Edit</button>
              <button data-delete="${escapeHtml(mk.id)}" style="font-size:12px;padding:2px 8px;border:1px solid #fca5a5;border-radius:4px;cursor:pointer;background:#fff;color:#dc2626">Delete</button>
            </div>
          </div>`;
        const marker = L.marker([mk.lat, mk.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml);
        if (isSelected) marker.setZIndexOffset(1000);
        marker.on("click", () => onSelectRef.current(mk.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._globeMarkers.push(marker);
        markerInstancesRef.current.set(mk.id, marker);
      }

      // Wire Edit/Delete buttons when a popup opens.
      map.off("popupopen");
      map.on("popupopen", (e: import("leaflet").PopupEvent) => {
        const container: HTMLElement | undefined = e.popup.getElement();
        if (!container) return;
        container.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
          btn.onclick = () => onEditRef.current(btn.dataset.edit!);
        });
        container.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
          btn.onclick = () => onDeleteRef.current(btn.dataset.delete!);
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, located.map((m) => `${m.id}:${m.lat},${m.lng}:${m.category}`).join("|"), JSON.stringify(attachmentsByMarkerId ? Object.fromEntries(Object.entries(attachmentsByMarkerId).map(([k, v]) => [k, v.length])) : null)]);

  // Fly to + highlight the selected marker whenever selectedId changes.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      // Restyle all markers to reflect new selection.
      for (const mk of located) {
        const instance = markerInstancesRef.current.get(mk.id);
        if (!instance) continue;
        const isSelected = mk.id === selectedId;
        instance.setIcon(isSelected ? selectedIcon(L, mk.category) : categoryIcon(L, mk.category));
        instance.setZIndexOffset(isSelected ? 1000 : 0);
      }
      // Fly to + open popup of the newly selected marker.
      if (!selectedId) return;
      const mk = located.find((m) => m.id === selectedId);
      if (!mk) return;
      const instance = markerInstancesRef.current.get(selectedId);
      if (!instance) return;
      map.flyTo([mk.lat, mk.lng], Math.max(map.getZoom(), 9), { duration: 0.6 });
      instance.openPopup();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div
      ref={mapRef}
      className="w-full h-56 sm:h-[440px] rounded-2xl overflow-hidden border border-border shadow-sm"
      aria-label="Globe map"
    />
  );
}
