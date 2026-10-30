"use client";

import { useMemo, useState } from "react";
import type { DayMapHop, DayMapModel, DayMapPoint } from "@/lib/day-map";
import { mapsUrl, appleMapsUrl, googleDirectionsUrl, appleDirectionsUrl } from "@/lib/map/maps";
import { useTheme } from "@/components/ui/theme-provider";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapPolyline } from "@/components/map/map-polyline";
import { MapUnavailable } from "@/components/map/map-unavailable";
import { useFitBounds } from "@/components/map/use-fit-bounds";
import { pinHtml } from "@/lib/map/pins";
import { hueHex } from "@/lib/map/palette";

export type { DayMapModel };

// "sky" / "lilac" rather than the old #2563eb / #7c3aed: ink text on those fails contrast (3.3:1 / 3.0:1).
function pointPinHtml(point: DayMapPoint, dark: boolean): string {
  if (point.kind === "item") {
    return pinHtml({ variant: "stop", fill: hueHex("sky", dark), label: String(point.order ?? 1), dark });
  }
  if (point.kind === "accommodation") return pinHtml({ variant: "home", label: "H", dark });
  return pinHtml({ variant: "stop", fill: hueHex("lilac", dark), label: "T", dark });
}

const linkClass = "text-primary hover:underline";

function OpenInMaps({ point }: { point: DayMapPoint }) {
  const google = mapsUrl({ lat: point.lat, lng: point.lng, label: point.label, placeId: point.placeId });
  const apple = appleMapsUrl({ lat: point.lat, lng: point.lng, label: point.label });
  if (!google && !apple) return null;
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {google && <a href={google} target="_blank" rel="noopener noreferrer" className={linkClass}>Google Maps</a>}
      {apple && <a href={apple} target="_blank" rel="noopener noreferrer" className={linkClass}>Apple Maps</a>}
    </span>
  );
}

function DirectionsFromPrevious({ point, prev }: { point: DayMapPoint; prev: DayMapPoint | undefined }) {
  if (point.kind !== "item" || !prev) return null;
  const google = googleDirectionsUrl([prev, point]);
  const apple = appleDirectionsUrl([prev, point]);
  if (!google && !apple) return null;
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      <span className="text-muted-foreground">Directions from previous:</span>
      {google && <a href={google} target="_blank" rel="noopener noreferrer" className={linkClass}>Google</a>}
      {apple && <a href={apple} target="_blank" rel="noopener noreferrer" className={linkClass}>Apple</a>}
    </span>
  );
}

function FitDay({ points }: { points: { lat: number; lng: number }[] }) {
  useFitBounds(points, { padding: 40 });
  return null;
}

const ROUTE_COLOR = "#2563eb";

function DayRoute({ routePoints, hops }: { routePoints: DayMapPoint[]; hops: DayMapHop[] | undefined }) {
  const path = useMemo(() => routePoints.map((p) => ({ lat: p.lat, lng: p.lng })), [routePoints]);
  const legs = useMemo(() => {
    if (!hops) return null;
    const at = new Map(routePoints.map((p) => [p.id, { lat: p.lat, lng: p.lng }]));
    const bed = routePoints[0]?.kind === "accommodation" && routePoints[1] ? [{ key: "bed", path: [path[0], path[1]], polyline: null }] : [];
    return [
      ...bed,
      ...hops.flatMap((h) => {
        const from = at.get(h.fromId);
        const to = at.get(h.toId);
        return from && to ? [{ key: `${h.fromId}>${h.toId}`, path: [from, to], polyline: h.polyline }] : [];
      }),
    ];
  }, [hops, routePoints, path]);
  if (!legs) return <MapPolyline path={path} color={ROUTE_COLOR} weight={3} opacity={0.7} dashed />;
  return (
    <>
      {legs.map((leg) =>
        leg.polyline ? (
          <MapPolyline key={leg.key} encodedPath={leg.polyline} color={ROUTE_COLOR} weight={4} opacity={0.85} />
        ) : (
          <MapPolyline key={leg.key} path={leg.path} color={ROUTE_COLOR} weight={3} opacity={0.7} dashed />
        ),
      )}
    </>
  );
}

function DayPointList({ points }: { points: DayMapPoint[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {points.map((point) => (
        <li key={`${point.kind}:${point.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-bold">{point.label}</span>
          <OpenInMaps point={point} />
        </li>
      ))}
    </ol>
  );
}

export function DayMap({ tripId, model }: { tripId: string; model: DayMapModel }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [openKey, setOpenKey] = useState<string | null>(null);

  const { points, routePoints, perItemPrev } = model;
  if (points.length === 0) return null;

  const googleRouteUrl = googleDirectionsUrl(routePoints);
  const appleRouteUrl = appleDirectionsUrl(routePoints);

  return (
    <div className="flex flex-col gap-2">
      {(googleRouteUrl || appleRouteUrl) && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground font-medium">Open today&apos;s route:</span>
          {googleRouteUrl && (
            <a href={googleRouteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Google Maps
            </a>
          )}
          {appleRouteUrl && (
            <a href={appleRouteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Apple Maps
            </a>
          )}
        </div>
      )}
      <GoogleMapFrame
        role="region"
        aria-label={`Day route map for trip ${tripId}`}
        dark={isDark}
        fallback={<MapUnavailable><DayPointList points={points} /></MapUnavailable>}
        style={{ height: 360 }}
        className="w-full rounded-2xl overflow-hidden border border-border shadow-sm"
      >
        <FitDay points={points} />
        {routePoints.length >= 2 && <DayRoute routePoints={routePoints} hops={model.hops} />}
        {points.map((point) => {
          const key = `${point.kind}:${point.id}`;
          return (
            <HtmlPin
              key={key}
              position={{ lat: point.lat, lng: point.lng }}
              html={pointPinHtml(point, isDark)}
              title={point.label}
              onClick={() => setOpenKey(key)}
              open={openKey === key}
              onClose={() => setOpenKey(null)}
            >
              <div className="flex min-w-[min(160px,80vw)] max-w-[min(260px,90vw)] flex-col gap-1 leading-normal">
                <strong className="text-sm">{point.label}</strong>
                <OpenInMaps point={point} />
                <DirectionsFromPrevious point={point} prev={perItemPrev[point.id]} />
              </div>
            </HtmlPin>
          );
        })}
      </GoogleMapFrame>
    </div>
  );
}
