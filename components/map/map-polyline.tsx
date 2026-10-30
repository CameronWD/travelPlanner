"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { decodePolyline } from "@/lib/travel-times/polyline";

export interface MapPolylineProps {
  path?: google.maps.LatLngLiteral[];
  encodedPath?: string;
  color: string;
  weight: number;
  opacity?: number;
  dashed?: boolean;
  geodesic?: boolean;
  zIndex?: number;
}

export function MapPolyline({ path: straight, encodedPath, color, weight, opacity, dashed = false, geodesic = false, zIndex }: MapPolylineProps) {
  const map = useMap();
  const path = useMemo(() => (encodedPath ? decodePolyline(encodedPath) : (straight ?? [])), [encodedPath, straight]);
  const lineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline();
    line.setMap(map);
    lineRef.current = line;
    return () => {
      line.setMap(null);
      lineRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    lineRef.current?.setOptions({
      path,
      geodesic,
      zIndex,
      strokeColor: color,
      strokeWeight: weight,
      strokeOpacity: dashed ? 0 : (opacity ?? 1),
      icons: dashed
        ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: opacity ?? 1, scale: weight }, offset: "0", repeat: "10px" }]
        : [],
    });
  }, [map, path, color, weight, opacity, dashed, geodesic, zIndex]);

  return null;
}
