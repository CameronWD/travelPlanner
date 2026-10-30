import { useEffect, useEffectEvent } from "react";
import { useMap } from "@vis.gl/react-google-maps";

export const FIT_SINGLE_ZOOM = 12;

export function useFitBounds(points: google.maps.LatLngLiteral[], opts: { padding?: number; maxZoom?: number } = {}): void {
  const map = useMap();
  const signature = points.map((p) => `${p.lat},${p.lng}`).join(";");

  const fit = useEffectEvent((target: google.maps.Map) => {
    const { padding = 40, maxZoom } = opts;
    if (points.length === 0) return;
    if (points.length === 1) {
      target.setCenter(points[0]);
      target.setZoom(maxZoom ?? FIT_SINGLE_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    target.fitBounds(bounds, padding);
    if (maxZoom === undefined) return;
    // fitBounds applies its zoom asynchronously, so the clamp waits for the camera to settle.
    const listener = target.addListener("idle", () => {
      listener.remove();
      const zoom = target.getZoom();
      if (zoom !== undefined && zoom > maxZoom) target.setZoom(maxZoom);
    });
  });

  useEffect(() => {
    if (map) fit(map);
  }, [map, signature]);
}
