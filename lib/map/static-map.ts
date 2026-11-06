import { stopHex } from "@/lib/stop-colours";

export type StaticMapStop = { id: string; lat: number | null; lng: number | null; sortOrder: number };
export type StaticMapInput = {
  key: string;
  mapId: string;
  width: number;
  height: number;
  stops: StaticMapStop[];
  home: { lat: number; lng: number } | null;
  legPaths?: Record<string, string>;
};

const BASE = "https://maps.googleapis.com/maps/api/staticmap";
const MAX_URL = 8192;
const INK = "0x1D1D1B";
const LINE = `color:${INK}FF|weight:3`;

type Point = { lat: number; lng: number };
type Located = { id: string; lat: number; lng: number; sortOrder: number };

const pt = (p: Point) => `${p.lat},${p.lng}`;
const param = (name: string, value: string) => `${name}=${encodeURIComponent(value)}`;

function paths(located: Located[], home: Point | null, legPaths: Record<string, string> | undefined): string[] {
  const out: string[] = [];
  let run: Point[] = [];
  const flush = () => {
    if (run.length > 1) out.push(`${LINE}|${run.map(pt).join("|")}`);
    run = [];
  };
  const straight = (from: Point, to: Point) => {
    if (run.length === 0) run.push(from);
    run.push(to);
  };
  if (home) straight(home, located[0]);
  for (let i = 1; i < located.length; i++) {
    const enc = legPaths?.[`${located[i - 1].id}>${located[i].id}`];
    if (enc) {
      flush();
      out.push(`${LINE}|enc:${enc}`);
    } else {
      straight(located[i - 1], located[i]);
    }
  }
  if (home) straight(located[located.length - 1], home);
  flush();
  return out;
}

export function staticMapUrl(input: StaticMapInput): string | null {
  const located = input.stops.filter(
    (s): s is Located => s.lat !== null && s.lng !== null,
  );
  if (located.length === 0) return null;

  const markers = located.map((s, i) => {
    const label = i < 9 ? `|label:${i + 1}` : "";
    return param("markers", `color:0x${stopHex(s.sortOrder, false).replace("#", "")}${label}|${pt(s)}`);
  });

  const build = (withHome: boolean, withEnc: boolean) => {
    const home = withHome ? input.home : null;
    const parts = [
      `size=${input.width}x${input.height}`,
      "scale=2",
      param("map_id", input.mapId),
      ...markers,
      ...(home ? [param("markers", `color:${INK}|label:H|${pt(home)}`)] : []),
      ...paths(located, home, withEnc ? input.legPaths : undefined).map((p) => param("path", p)),
      param("key", input.key),
    ];
    return `${BASE}?${parts.join("&")}`;
  };

  for (const [withHome, withEnc] of [[true, true], [true, false], [false, false]] as const) {
    const url = build(withHome, withEnc);
    if (url.length <= MAX_URL) return url;
  }
  return build(false, false);
}
