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
import { escapeHtml } from "@/lib/escape-html";
import { pinHex, pinHtml, pinSize } from "@/lib/map-pins";
import { applyLeafletIconDefaults } from "@/lib/map-icons";

export interface GlobeMapProps {
  markers: MarkerView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  attachmentsByMarkerId?: Record<string, { id: string }[]>;
}

function categoryIcon(L: typeof import("leaflet"), category: string, dark: boolean): import("leaflet").DivIcon {
  const size = pinSize("category");
  return L.divIcon({
    html: pinHtml({ variant: "category", fill: pinHex(category, dark), dark }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

function selectedIcon(L: typeof import("leaflet"), category: string, dark: boolean): import("leaflet").DivIcon {
  const size = pinSize("category");
  return L.divIcon({
    html: pinHtml({ variant: "category", fill: pinHex(category, dark), dark, selected: true }),
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
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
      applyLeafletIconDefaults(L);
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
    // `isDark` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so depending on the theme would rebuild it (losing pan/zoom) on
    // every toggle. The separate setUrl effect below swaps tiles in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap tiles when the theme flips, without rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
  }, [isDark]);

  // Re-render markers whenever the located set changes. `isDark` is
  // deliberately NOT a dependency here: this effect clears and recreates every
  // marker (and its popup binding), so depending on the theme would close any
  // currently-open popup on every toggle. The separate recolour effect below
  // uses `setIcon` in place instead, matching wishlist-map.tsx/day-map.tsx.
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
        const icon = isSelected ? selectedIcon(L, mk.category, isDark) : categoryIcon(L, mk.category, isDark);
        const attachCount = attachmentsByMarkerId?.[mk.id]?.length ?? 0;
        const attachLine = attachCount > 0
          ? `<p class="m-0 mb-1 text-xs font-semibold text-muted-foreground">${attachCount} ${attachCount === 1 ? "file" : "files"}</p>`
          : "";
        // Token classes only (Tailwind scans this file), so the popup follows the theme;
        // the shell (.tp-map-popup in globals.css) gives it the kit outline + hard shadow.
        const popupHtml = `
          <div class="min-w-[min(140px,80vw)] max-w-[min(240px,90vw)] leading-normal">
            <strong class="mb-1.5 block font-display text-sm font-extrabold">${escapeHtml(mk.title)}</strong>
            ${attachLine}
            <div class="mt-1 flex gap-1.5">
              <button type="button" data-edit="${escapeHtml(mk.id)}" class="h-11 cursor-pointer rounded-full border-2 border-border bg-card px-4 text-xs font-extrabold text-foreground shadow-hard-1">Edit</button>
              <button type="button" data-delete="${escapeHtml(mk.id)}" class="h-11 cursor-pointer rounded-full border-2 border-border bg-destructive px-4 text-xs font-extrabold text-destructive-foreground shadow-hard-1">Delete</button>
            </div>
          </div>`;
        const marker = L.marker([mk.lat, mk.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { className: "tp-map-popup" });
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

  // Recolour existing markers in place when the theme flips. Uses `setIcon`
  // rather than remove-and-recreate (unlike the effect above, which only
  // rebuilds when the marker *set* changes), so a currently-open popup and
  // the viewport (pan/zoom) are both left alone. Reads `selectedId` so the
  // selected marker keeps its `selectedIcon` (lift + ring) rather than
  // dropping back to the plain `categoryIcon` on a toggle.
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    import("leaflet").then((leaflet) => {
      const L = leaflet.default ?? leaflet;
      for (const mk of located) {
        const instance = markerInstancesRef.current.get(mk.id);
        if (!instance) continue;
        const isSelected = mk.id === selectedId;
        instance.setIcon(isSelected ? selectedIcon(L, mk.category, isDark) : categoryIcon(L, mk.category, isDark));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, located.map((m) => `${m.id}:${m.category}`).join("|")]);

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
        instance.setIcon(isSelected ? selectedIcon(L, mk.category, isDark) : categoryIcon(L, mk.category, isDark));
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
      className="tp-map h-[260px] w-full overflow-hidden rounded-lg border-2 border-border lg:h-[460px]"
      aria-label="Globe map"
    />
  );
}
