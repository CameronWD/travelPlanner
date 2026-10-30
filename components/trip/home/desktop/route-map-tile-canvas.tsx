"use client";

/**
 * The map half of the desktop Home Route map tile (route-map-tile.tsx owns
 * the chips, inset cards, attribution and error boundary). A failed or
 * keyless map throws into that boundary, which draws the tile's error panel.
 *
 * Pins: 30px numbered stickers in each Stop's own colour (lib/stop-colours →
 * lib/map/palette hex). After every fit/zoom, pins closer than 32px on screen
 * are merged into one count pin (lib/map/overlap) — clicking it zooms in.
 * Clicking a Stop pin opens the Plan at that Stop (`#stop-<id>`).
 */

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { useTheme } from "@/components/ui/theme-provider";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapPolyline } from "@/components/map/map-polyline";
import { hueHex, routeStyles } from "@/lib/map/palette";
import { pinHtml } from "@/lib/map/pins";
import { mergeOverlapping } from "@/lib/map/overlap";
import type { Hue } from "@/lib/hues";

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

const MERGE_PX = 32;
const FIT_PADDING = 48;
const FOCUS_ZOOM = 7;
const FIRST_ZOOM = 2;

const WORLD_RESTRICTION = {
  latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
  strictBounds: false,
};

// Only distances between pins matter, so Web Mercator at the current zoom is enough — no projection object needed.
function toScreen(lat: number, lng: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function FitView({ stops, mainIds, view }: { stops: CanvasStop[]; mainIds: string[]; view: MapView }) {
  const map = useMap();
  const set = view === "whole" ? stops : stops.filter((s) => mainIds.includes(s.id));
  const points = (set.length > 0 ? set : stops).map((s) => ({ lat: s.lat, lng: s.lng }));
  const signature = points.map((p) => `${p.lat},${p.lng}`).join(";");

  const fit = useEffectEvent((target: google.maps.Map) => {
    if (points.length === 0) return;
    if (points.length === 1) {
      target.setCenter(points[0]);
      target.setZoom(FOCUS_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    target.fitBounds(bounds, FIT_PADDING);
  });

  useEffect(() => {
    if (map) fit(map);
  }, [map, view, signature]);
  return null;
}

function FocusStop({ stops, focus }: { stops: CanvasStop[]; focus: { id: string; seq: number } | null }) {
  const map = useMap();
  const pan = useEffectEvent((target: google.maps.Map, id: string) => {
    const s = stops.find((x) => x.id === id);
    if (!s) return;
    target.setCenter({ lat: s.lat, lng: s.lng });
    target.setZoom(FOCUS_ZOOM);
  });
  useEffect(() => {
    if (map && focus) pan(map, focus.id);
  }, [map, focus]);
  return null;
}

function RouteLine({ stops, dark }: { stops: CanvasStop[]; dark: boolean }) {
  const path = useMemo(() => stops.map((s) => ({ lat: s.lat, lng: s.lng })), [stops]);
  const styles = routeStyles(dark);
  return (
    <>
      <MapPolyline path={path} color={styles.casing.color} weight={styles.casing.weight} opacity={styles.casing.opacity} zIndex={1} />
      <MapPolyline path={path} color={styles.line.color} weight={styles.line.weight} opacity={styles.line.opacity} zIndex={2} />
    </>
  );
}

function Pins({ stops, dark, onPinClick }: { stops: CanvasStop[]; dark: boolean; onPinClick: (stopId: string) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(FIRST_ZOOM);

  useEffect(() => {
    if (!map) return;
    const sync = () => setZoom(map.getZoom() ?? FIRST_ZOOM);
    sync();
    const listener = map.addListener("zoom_changed", sync);
    return () => listener.remove();
  }, [map]);

  const groups = useMemo(() => {
    const byId = new Map(stops.map((s) => [s.id, s] as const));
    const screen = stops.map((s) => ({ id: s.id, ...toScreen(s.lat, s.lng, zoom) }));
    return mergeOverlapping(screen, MERGE_PX).map((g) => g.ids.map((id) => byId.get(id)!));
  }, [stops, zoom]);

  return (
    <>
      {groups.map((members) => {
        if (members.length === 1) {
          const s = members[0];
          return (
            <HtmlPin
              key={s.id}
              position={{ lat: s.lat, lng: s.lng }}
              html={pinHtml({ variant: "stop", fill: hueHex(s.stopColour, dark), label: String(s.number), dark, size: 30 })}
              title={`${s.number}. ${s.name}`}
              onClick={() => onPinClick(s.id)}
            />
          );
        }
        const lat = members.reduce((a, s) => a + s.lat, 0) / members.length;
        const lng = members.reduce((a, s) => a + s.lng, 0) / members.length;
        return (
          <HtmlPin
            key={`cluster:${members.map((s) => s.id).join(",")}`}
            position={{ lat, lng }}
            html={pinHtml({ variant: "cluster", label: String(members.length), dark })}
            title={`${members.length} stops: ${members.map((s) => s.name).join(", ")}`}
            onClick={() => {
              if (!map) return;
              const bounds = new google.maps.LatLngBounds();
              for (const s of members) bounds.extend({ lat: s.lat, lng: s.lng });
              map.fitBounds(bounds, FIT_PADDING);
            }}
          />
        );
      })}
    </>
  );
}

export function RouteMapTileCanvas({ stops, mainIds, view, focus, onPinClick }: RouteMapTileCanvasProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [failed, setFailed] = useState(false);

  if (failed) throw new Error("The map is unavailable");

  return (
    <GoogleMapFrame
      role="region"
      aria-label="Trip route map"
      dark={isDark}
      fallback={null}
      onFail={() => setFailed(true)}
      className="absolute inset-0 isolate z-0 bg-canvas"
      mapProps={{
        defaultCenter: { lat: 20, lng: 0 },
        defaultZoom: FIRST_ZOOM,
        minZoom: 1,
        gestureHandling: "cooperative",
        restriction: WORLD_RESTRICTION,
      }}
    >
      <FitView stops={stops} mainIds={mainIds} view={view} />
      <FocusStop stops={stops} focus={focus} />
      {view !== "cluster" && stops.length >= 2 && <RouteLine stops={stops} dark={isDark} />}
      <Pins stops={stops} dark={isDark} onPinClick={onPinClick} />
    </GoogleMapFrame>
  );
}
