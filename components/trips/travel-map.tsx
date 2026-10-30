"use client";

/**
 * "Your travels" — the Travel map (TRIPS_PAGE.md §5, §8; CONTEXT.md "Your
 * travels", "Trip colour"). Every trip's located Stops as 20px pins (14px on
 * mobile) in the trip's own hue, legs joined by a dashed ink line. Never a
 * leg from the Home base (the loader never includes it). Done trips draw at
 * full opacity.
 *
 * NEVER "Globe" — that's the separate, cross-trip places-you-want-to-go map
 * (components/globe/globe-map.tsx). This is personal, derived, and shows
 * only real-plan Trips the Traveller is actually on.
 *
 * Client-only (Google's Maps library touches the DOM); loaded via TravelMapLoader
 * (ssr:false), matching components/trip/route-map.tsx / components/globe/
 * globe-map.tsx.
 */

import { useEffect, useMemo } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { useTheme } from "@/components/ui/theme-provider";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapPolyline } from "@/components/map/map-polyline";
import { useFitBounds } from "@/components/map/use-fit-bounds";
import { pinHtml } from "@/lib/map/pins";
import { hueHex, mapInk } from "@/lib/map/palette";
import { WORLD_RESTRICTION } from "@/lib/map/world";
import type { TravelMapTrip } from "@/lib/trips/trip-views";

export type { TravelMapTrip };

export interface TravelMapProps {
  trips: TravelMapTrip[];
  /** null = every trip. */
  filterTripId: string | null;
  variant: "desktop" | "mobile";
  /** Called once if Google's Maps library can't load or the map fails to build. */
  onFail?: () => void;
}

const WORLD = { center: { lat: 20, lng: 0 }, zoom: 1 };

function FitTravels({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  useFitBounds(points, { padding: 40 });
  const empty = points.length === 0;
  useEffect(() => {
    if (!map || !empty) return;
    map.setCenter(WORLD.center);
    map.setZoom(WORLD.zoom);
  }, [map, empty]);
  return null;
}

function TripLayer({ trip, dark, size, desktop }: { trip: TravelMapTrip; dark: boolean; size: number; desktop: boolean }) {
  const path = useMemo(() => trip.points.map((p) => ({ lat: p.lat, lng: p.lng })), [trip.points]);
  const html = pinHtml({ variant: "stop", fill: hueHex(trip.hue, dark), dark, size, shadow: desktop });
  return (
    <>
      {path.length >= 2 && <MapPolyline path={path} color={mapInk(dark).ink} weight={1.5} opacity={1} dashed geodesic />}
      {path.map((position, i) => (
        <HtmlPin key={i} position={position} html={html} />
      ))}
    </>
  );
}

/**
 * "Your travels" map (TRIPS_PAGE.md §5, §8; CONTEXT.md "Your travels", "Trip
 * colour"): every trip's located Stops as 20px pins (14px on mobile) in the
 * trip's colour, legs joined by a dashed ink line. Never a leg from the Home
 * base (the loader never includes it). Done trips draw at full opacity.
 */
export function TravelMap({ trips, filterTripId, variant, onFail }: TravelMapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const size = variant === "mobile" ? 14 : 20;
  const shown = useMemo(() => (filterTripId ? trips.filter((t) => t.id === filterTripId) : trips), [trips, filterTripId]);
  const points = useMemo(() => shown.flatMap((t) => t.points.map((p) => ({ lat: p.lat, lng: p.lng }))), [shown]);

  return (
    <GoogleMapFrame
      role="region"
      aria-label="Your travels map"
      dark={isDark}
      fallback={null}
      onFail={onFail}
      className="absolute inset-0 bg-map-fill"
      mapProps={{
        defaultCenter: WORLD.center,
        defaultZoom: WORLD.zoom,
        minZoom: 1,
        zoomControl: false,
        gestureHandling: "cooperative",
        restriction: WORLD_RESTRICTION,
      }}
    >
      <FitTravels points={points} />
      {shown.map((trip) => (
        <TripLayer key={trip.id} trip={trip} dark={isDark} size={size} desktop={variant === "desktop"} />
      ))}
    </GoogleMapFrame>
  );
}
