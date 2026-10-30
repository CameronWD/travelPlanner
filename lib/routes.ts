import "server-only";
import type { LatLng } from "@/lib/geo";
import { fetchJson, finite, hasServerKey, isRecord, serverKey } from "@/lib/google-fetch";

export type RouteMode = "WALK" | "DRIVE" | "TRANSIT";

export type RouteResult =
  | { status: "ok"; minutes: number; distanceM: number; polyline: string }
  | { status: "none" }
  | { status: "error" };

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";
const ERROR: RouteResult = { status: "error" };

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

function seconds(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw);
  return m ? Number(m[1]) : null;
}

export async function computeRoute(from: LatLng, to: LatLng, mode: RouteMode, departure?: Date): Promise<RouteResult> {
  const key = serverKey();
  if (!key || !hasServerKey()) return ERROR;
  const body: Record<string, unknown> = {
    origin: waypoint(from),
    destination: waypoint(to),
    travelMode: mode,
  };
  if (mode === "TRANSIT" && departure) body.departureTime = departure.toISOString();
  const res = await fetchJson(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !isRecord(res.body)) return ERROR;
  const routes = res.body.routes;
  if (routes === undefined) return { status: "none" };
  if (!Array.isArray(routes)) return ERROR;
  if (routes.length === 0) return { status: "none" };
  const route = routes[0];
  if (!isRecord(route)) return ERROR;
  const secs = seconds(route.duration);
  if (secs === null) return ERROR;
  const distance = route.distanceMeters === undefined ? 0 : route.distanceMeters;
  if (!finite(distance)) return ERROR;
  const line = isRecord(route.polyline) && typeof route.polyline.encodedPolyline === "string" ? route.polyline.encodedPolyline : "";
  return { status: "ok", minutes: Math.ceil(secs / 60), distanceM: distance, polyline: line };
}
