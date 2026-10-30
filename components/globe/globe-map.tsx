"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useMap, type MapMouseEvent } from "@vis.gl/react-google-maps";
import type { ArrivalPin, MarkerView } from "@/components/globe/types";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapUnavailable } from "@/components/map/map-unavailable";
import { useFitBounds } from "@/components/map/use-fit-bounds";
import { useTheme } from "@/components/ui/theme-provider";
import { pinHex, pinHtml } from "@/lib/map/pins";
import { hueHex } from "@/lib/map/palette";
import { ARRIVAL_FLY_S, PIN_STAGGER_MS } from "./arrival";

export interface GlobeMapProps {
  markers: MarkerView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  attachmentsByMarkerId?: Record<string, { id: string }[]>;
  /** A just-created Trip's located Stops (Task 15's `?added=` arrival), drawn as their own numbered pins. */
  arrivalPins?: ArrivalPin[];
}

type LocatedMarker = MarkerView & { lat: number; lng: number };

const WORLD_RESTRICTION = {
  latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
  strictBounds: false,
};

function FitInitial({ points }: { points: google.maps.LatLngLiteral[] }) {
  const [initial] = useState(points);
  useFitBounds(initial, { padding: 40, maxZoom: 8 });
  return null;
}

function FitArrival({ pins }: { pins: ArrivalPin[] }) {
  useFitBounds(pins.map((p) => ({ lat: p.lat, lng: p.lng })), { padding: 40, maxZoom: 8 });
  return null;
}

function PanToSelected({ selectedId, located }: { selectedId: string | null; located: LocatedMarker[] }) {
  const map = useMap();
  const pan = useEffectEvent((target: google.maps.Map, id: string) => {
    const mk = located.find((m) => m.id === id);
    if (!mk) return;
    target.panTo({ lat: mk.lat, lng: mk.lng });
    if ((target.getZoom() ?? 0) < 9) target.setZoom(9);
  });
  useEffect(() => {
    if (map && selectedId) pan(map, selectedId);
  }, [map, selectedId]);
  return null;
}

export function GlobeMap({ markers, selectedId, onSelect, onEdit, onDelete, onMapClick, attachmentsByMarkerId, arrivalPins }: GlobeMapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [openId, setOpenId] = useState<string | null>(selectedId);
  const [seenSelectedId, setSeenSelectedId] = useState(selectedId);
  if (seenSelectedId !== selectedId) {
    setSeenSelectedId(selectedId);
    setOpenId(selectedId);
  }

  const located = markers.filter((m): m is LocatedMarker => m.lat != null && m.lng != null);
  const arrival = arrivalPins ?? [];

  return (
    <GoogleMapFrame
      role="region"
      aria-label="Globe map"
      dark={isDark}
      fallback={<MapUnavailable />}
      className="h-[260px] w-full overflow-hidden rounded-lg border-2 border-border lg:h-[calc(100dvh-4.5rem)] lg:min-h-[460px]"
      mapProps={{
        defaultCenter: { lat: 20, lng: 0 },
        defaultZoom: 2,
        minZoom: 2,
        restriction: WORLD_RESTRICTION,
        onClick: (e: MapMouseEvent) => {
          const at = e.detail.latLng;
          if (at) onMapClick(at.lat, at.lng);
        },
      }}
    >
      <FitInitial points={located} />
      <FitArrival pins={arrival} />
      <PanToSelected selectedId={selectedId} located={located} />
      {located.map((mk) => {
        const isSelected = mk.id === selectedId;
        const attachCount = attachmentsByMarkerId?.[mk.id]?.length ?? 0;
        return (
          <HtmlPin
            key={mk.id}
            position={{ lat: mk.lat, lng: mk.lng }}
            html={pinHtml({ variant: "category", fill: pinHex(mk.category, isDark), dark: isDark, selected: isSelected })}
            title={mk.title}
            zIndex={isSelected ? 1000 : undefined}
            onClick={() => {
              setOpenId(mk.id);
              onSelect(mk.id);
            }}
            open={openId === mk.id}
            onClose={() => setOpenId(null)}
          >
            <div className="min-w-[min(140px,80vw)] max-w-[min(240px,90vw)] leading-normal">
              <strong className="mb-1.5 block font-display text-sm font-extrabold">{mk.title}</strong>
              {attachCount > 0 ? (
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  {attachCount} {attachCount === 1 ? "file" : "files"}
                </span>
              ) : null}
              <div className="mt-1 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onEdit(mk.id)}
                  className="h-11 cursor-pointer rounded-full border-2 border-border bg-card px-4 text-xs font-extrabold text-foreground shadow-hard-1"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(mk.id)}
                  className="h-11 cursor-pointer rounded-full border-2 border-border bg-destructive px-4 text-xs font-extrabold text-destructive-foreground shadow-hard-1"
                >
                  Delete
                </button>
              </div>
            </div>
          </HtmlPin>
        );
      })}
      {arrival.map((p, i) => (
        <HtmlPin
          key={`arrival-${p.id}`}
          position={{ lat: p.lat, lng: p.lng }}
          title={p.name}
          html={`<div class="tp-pin-pop" style="animation-delay:${ARRIVAL_FLY_S * 1000 + i * PIN_STAGGER_MS}ms">${pinHtml({ variant: "stop", fill: hueHex("coral", isDark), dark: isDark, label: String(i + 1) })}</div>`}
        />
      ))}
    </GoogleMapFrame>
  );
}
