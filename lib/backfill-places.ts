import { haversineKm, type LatLng } from "@/lib/geo";

export type BackfillKind = "item" | "stop" | "accommodation" | "transport-dep" | "transport-arr" | "marker" | "home";
export type BackfillVerdict = "accept" | "new" | "too-far" | "no-match";

export function toleranceKm(kind: BackfillKind): number {
  return kind === "stop" || kind === "home" ? 25 : 1;
}

export function verdict(kind: BackfillKind, old: LatLng | null, next: LatLng | null): BackfillVerdict {
  if (!next) return "no-match";
  if (!old) return "new";
  return haversineKm(old, next) <= toleranceKm(kind) ? "accept" : "too-far";
}

const point = (p: LatLng | null): string => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : "—");

export function formatRow(row: {
  kind: BackfillKind;
  id: string;
  query: string;
  old: LatLng | null;
  next: LatLng | null;
  verdict: BackfillVerdict;
}): string {
  const km = row.old && row.next ? haversineKm(row.old, row.next).toFixed(1) : "—";
  return `${row.kind} ${row.id} · "${row.query}" · ${point(row.old)} → ${point(row.next)} · ${km} km · ${row.verdict.toUpperCase()}`;
}
