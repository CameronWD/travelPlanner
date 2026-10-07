"use client";

/**
 * The Leaflet half of the desktop Home Route map tile (route-map-tile.tsx owns
 * the chips, inset cards, attribution and error boundary). Leaflet itself is
 * only ever loaded by a dynamic import() inside an effect, so nothing here
 * touches `window` during SSR.
 *
 * Pins: 30px numbered stickers in each Stop's own colour (lib/stop-colours →
 * lib/map-palette hex). After every fit/zoom, pins closer than 32px on screen
 * are merged into one count pin (lib/map-overlap) — clicking it zooms in.
 * Clicking a Stop pin opens the Plan at that Stop (`#stop-<id>`).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ui/theme-provider";
import { cartoTiles } from "@/lib/map-tiles";
import { hueHex, routeStyles } from "@/lib/map-palette";
import { pinHtml, pinSize } from "@/lib/map-pins";
import { mergeOverlapping } from "@/lib/map-overlap";
import { escapeHtml } from "@/lib/escape-html";
import type { Hue } from "@/lib/hues";

import "leaflet/dist/leaflet.css";

interface CanvasStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stopColour: Hue;
  number: number;
}

export type MapView = "route" | "cluster" | "whole";

export interface RouteMapTileCanvasProps {
  /** Located Stops, in plan order. */
  stops: CanvasStop[];
  /** Ids of the main geographic cluster — what "route" and "cluster" fit. */
  mainIds: string[];
  view: MapView;
  /** Pan to one Stop (an inset card was clicked); `seq` re-triggers the same Stop. */
  focus: { id: string; seq: number } | null;
  onPinClick: (stopId: string) => void;
}

const PIN_PX = 30;
const MERGE_PX = 32;
const FIT_PADDING: [number, number] = [48, 48];

type L = typeof import("leaflet");

export function RouteMapTileCanvas({ stops, mainIds, view, focus, onPinClick }: RouteMapTileCanvasProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxRef = useRef<{ L: L; map: any; tiles: any; line: any[]; markers: any[] } | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Latest props for Leaflet callbacks registered once.
  // Synced in a layout effect, which runs before every passive effect below.
  const live = useRef({ stops, mainIds, view, isDark, onPinClick });
  useLayoutEffect(() => {
    live.current = { stops, mainIds, view, isDark, onPinClick };
  });

  function drawPins() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { L: lf, map } = ctx;
    const { stops: all, isDark: dark } = live.current;
    for (const m of ctx.markers) m.remove();
    ctx.markers = [];

    const byId = new Map(all.map((s) => [s.id, s] as const));
    const screen = all.map((s) => {
      const p = map.latLngToContainerPoint([s.lat, s.lng]);
      return { id: s.id, x: p.x, y: p.y };
    });
    for (const group of mergeOverlapping(screen, MERGE_PX)) {
      const members = group.ids.map((id) => byId.get(id)!);
      if (members.length === 1) {
        const s = members[0];
        const marker = lf
          .marker([s.lat, s.lng], {
            icon: lf.divIcon({
              html: pinHtml({ variant: "stop", fill: hueHex(s.stopColour, dark), label: String(s.number), dark, size: PIN_PX }),
              className: "",
              iconSize: [PIN_PX, PIN_PX],
              iconAnchor: [PIN_PX / 2, PIN_PX / 2],
            }),
            title: `${s.number}. ${s.name}`,
            alt: `${s.number}. ${s.name}`,
            keyboard: true,
          })
          .addTo(map);
        marker.on("click", () => live.current.onPinClick(s.id));
        ctx.markers.push(marker);
      } else {
        const size = pinSize("cluster");
        const lat = members.reduce((a, s) => a + s.lat, 0) / members.length;
        const lng = members.reduce((a, s) => a + s.lng, 0) / members.length;
        const names = members.map((s) => escapeHtml(s.name)).join(", ");
        const marker = lf
          .marker([lat, lng], {
            icon: lf.divIcon({
              html: pinHtml({ variant: "cluster", label: String(members.length), dark }),
              className: "",
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
            title: `${members.length} stops: ${names}`,
            alt: `${members.length} stops`,
            keyboard: true,
          })
          .addTo(map);
        marker.on("click", () => {
          map.fitBounds(lf.latLngBounds(members.map((s): [number, number] => [s.lat, s.lng])), { padding: FIT_PADDING });
        });
        ctx.markers.push(marker);
      }
    }
  }

  function drawLine() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    for (const l of ctx.line) l.remove?.();
    ctx.line = [];
    const { stops: all, view: v, isDark: dark } = live.current;
    // The cluster view is pins only; Route and Whole trip draw the route.
    if (v === "cluster" || all.length < 2) return;
    const styles = routeStyles(dark);
    const latlngs = all.map((s): [number, number] => [s.lat, s.lng]);
    ctx.line.push(ctx.L.polyline(latlngs, { ...styles.casing }).addTo(ctx.map));
    ctx.line.push(ctx.L.polyline(latlngs, { ...styles.line }).addTo(ctx.map));
  }

  function fit() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { stops: all, mainIds: main, view: v } = live.current;
    const set = v === "whole" ? all : all.filter((s) => main.includes(s.id));
    const points = (set.length > 0 ? set : all).map((s): [number, number] => [s.lat, s.lng]);
    if (points.length === 0) return;
    if (points.length === 1) ctx.map.setView(points[0], 7);
    else ctx.map.fitBounds(ctx.L.latLngBounds(points), { padding: FIT_PADDING });
  }

  // Build the map once per set of Stops.
  const signature = stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.stopColour}:${s.number}`).join("|");
  useEffect(() => {
    if (!elRef.current || ctxRef.current) return;
    let cancelled = false;
    import("leaflet")
      .then((leaflet) => {
        if (cancelled || !elRef.current) return;
        const lf: L = (leaflet as { default?: L }).default ?? (leaflet as L);
        const map = lf.map(elRef.current, {
          zoomControl: false,
          scrollWheelZoom: false,
          // Attribution is drawn by the tile itself, restyled (spec §6).
          attributionControl: false,
          worldCopyJump: false,
          maxBounds: [
            [-85, -180],
            [85, 180],
          ],
          maxBoundsViscosity: 1,
          minZoom: 1,
        });
        const t = cartoTiles(live.current.isDark);
        const tiles = lf
          .tileLayer(t.url, { subdomains: t.subdomains, maxZoom: t.maxZoom, noWrap: true })
          .addTo(map);
        ctxRef.current = { L: lf, map, tiles, line: [], markers: [] };
        map.on("zoomend", drawPins);
        drawLine();
        fit();
        drawPins();
      })
      .catch((e) => {
        if (!cancelled) setError(e ?? new Error("Map failed to load"));
      });
    return () => {
      cancelled = true;
      ctxRef.current?.map.remove();
      ctxRef.current = null;
    };
    // Rebuild only when the plotted Stops change (see RouteMap for the same pattern).
  }, [signature]);

  // Chip changes: redraw the route line and refit.
  useEffect(() => {
    drawLine();
    fit();
    drawPins();
  }, [view]);

  // Inset card clicked: pan to that Stop.
  useEffect(() => {
    if (!focus) return;
    const s = stops.find((x) => x.id === focus.id);
    if (s) ctxRef.current?.map.setView([s.lat, s.lng], 7);
    drawPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.seq]);

  // Theme flip: swap tiles and recolour in place — no rebuild.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.tiles.setUrl(cartoTiles(isDark).url);
    drawLine();
    drawPins();
  }, [isDark]);

  // Rethrow async failures (e.g. the Leaflet chunk failed to load) into the
  // tile's error boundary — after every hook, so hook order never changes.
  if (error) throw error;

  return <div ref={elRef} role="region" aria-label="Trip route map" className="tp-map absolute inset-0 isolate z-0 bg-canvas" />;
}
