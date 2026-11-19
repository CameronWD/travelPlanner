import type { SceneKey } from "@/lib/weather/theme";

const CALM_KPH = 15;
const FULL_LEAN_KPH = 60;
const MAX_LEAN_DEG = 30;

export function rainAngleDeg(gustsKph: number | null): number {
  if (gustsKph == null || gustsKph < CALM_KPH) return 0;
  return Math.min(MAX_LEAN_DEG, ((gustsKph - CALM_KPH) / (FULL_LEAN_KPH - CALM_KPH)) * MAX_LEAN_DEG);
}

export function sunArcPosition(sunrise: Date, sunset: Date, now: Date): number | null {
  const t = (now.getTime() - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime());
  return t < 0 || t > 1 ? null : t;
}

// Sunrise, sunset and "now" all arrive as the place's wall-clock "HH:MM".
// Pinning them to one UTC day keeps their differences independent of the
// server's own zone.
export function clockTime(hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m));
}

export type CardSize = "regular" | "compact";

// A scene is drawn on the card's padding box: the 236px and 140px cards less
// their 2px borders. One scene unit is that height over 236, at either size.
export const SCENE_H = 236;
const CANVAS_PX: Record<CardSize, number> = { regular: 232, compact: 136 };

// The widest weather card the Day view renders at each height
// (app/(app)/trips/[tripId]/day/page.tsx):
// - compact, below md: 767px viewport less 2 x 24px page padding = 719px;
// - regular, md to lg, full width: 1023px less the 96px dock and 2 x 32px padding = 863px.
// The narrowest: compact on a 320px phone, 288px; regular in the lg side
// column, (1024 - 96 - 64 - 18) x 5/12 = 352px, or about 346px when a
// classic scrollbar takes 15px of the 1024px window, so 343 to be safe.
export const CARD_WIDTHS: Record<CardSize, { narrowest: number; widest: number }> = {
  regular: { narrowest: 343, widest: 863 },
  compact: { narrowest: 288, widest: 719 },
};
export const canvasUnits = (size: CardSize, cardPx: number) => ((cardPx - 4) * SCENE_H) / CANVAS_PX[size];
export const SCATTER_W = Math.ceil(Math.max(canvasUnits("regular", 863), canvasUnits("compact", 719)) / 20) * 20 + 40;

// The daylight row sits on a plain strip from here down: nothing is drawn in
// it. Today's sun marker rides above the compact arc to about 168.
export const STRIP_TOP = 166;

// Where the card's words sit, in scene units from the canvas's top-left,
// measured in Chromium and WebKit with the app's fonts and each scene's
// widest words: a long place name, -28° / -30°, and the longest condition and
// chip the scene can show. TEXT_MARGIN keeps outlines and shadows off them.
// The place name is the Traveller's own text, so the label line is taken to
// run the full width.
export const TEXT_MARGIN = 8;
interface Rows { labelBottom: number | null; temp: [top: number, bottom: number]; cond: [top: number, bottom: number] }
const TEXT_ROWS: Record<CardSize, Rows> = {
  regular: { labelBottom: 35, temp: [45, 99], cond: [103, 132] },
  compact: { labelBottom: null, temp: [34, 100], cond: [107, 148] },
};
type Rights = Record<SceneKey, [temp: number, cond: number]>;
const TEXT_RIGHT: Record<CardSize, Rights> = {
  regular: {
    sunny: [200, 233], partly: [200, 299], overcast: [200, 219], fog: [200, 168], rain: [200, 198],
    snow: [200, 254], storm: [200, 203], wind: [200, 197], heat: [175, 298], night: [189, 237],
  },
  compact: {
    sunny: [261, 354], partly: [261, 448], overcast: [261, 329], fog: [261, 254], rain: [261, 298],
    snow: [261, 381], storm: [261, 306], wind: [261, 297], heat: [228, 450], night: [247, 355],
  },
};

export interface Zone { top: number; bottom: number; right: number }
const FULL = Number.POSITIVE_INFINITY;

export function textZones(scene: SceneKey, size: CardSize): Zone[] {
  const rows = TEXT_ROWS[size];
  const [tempRight, condRight] = TEXT_RIGHT[size][scene];
  const m = TEXT_MARGIN;
  return [
    ...(rows.labelBottom == null ? [] : [{ top: 0, bottom: rows.labelBottom + m, right: FULL }]),
    { top: rows.temp[0] - m, bottom: rows.temp[1] + m, right: tempRight + m },
    { top: rows.cond[0] - m, bottom: rows.cond[1] + m, right: condRight + m },
    { top: STRIP_TOP, bottom: SCENE_H, right: FULL },
  ];
}

// How far from the left the words reach anywhere between y0 and y1.
export function wordsReach(zones: Zone[], y0: number, y1: number): number {
  return Math.max(0, ...zones.filter((z) => z.top < y1 && z.bottom > y0).map((z) => z.right));
}

// The part of the card where moving pieces may show: one block to the right of
// the widest words, from below the label line (regular only) to the daylight
// strip. A single edge, so no open band is left above or below the text.
export function sceneClip(scene: SceneKey, size: CardSize): string {
  const zones = textZones(scene, size);
  const top = Math.max(0, ...zones.filter((z) => z.right === FULL && z.top === 0).map((z) => z.bottom));
  const y = (units: number) => `${((units / SCENE_H) * 100).toFixed(2)}%`;
  const x = clipLeftPx(scene, size, 0);
  return `polygon(100% ${y(top)}, 100% ${y(STRIP_TOP)}, ${x} ${y(STRIP_TOP)}, ${x} ${y(top)})`;
}

// Moving pieces fade in over this many units right of the clip's edge, so a
// cloud drifting towards the words thins out instead of being sliced.
const FADE_UNITS = 20;

export function sceneFade(scene: SceneKey, size: CardSize): string {
  return `linear-gradient(to right, transparent ${clipLeftPx(scene, size, 0)}, #000 ${clipLeftPx(scene, size, FADE_UNITS)})`;
}

function clipLeftPx(scene: SceneKey, size: CardSize, plusUnits: number): string {
  const left = Math.max(...textZones(scene, size).filter((z) => z.right !== FULL).map((z) => z.right));
  return `${((left + plusUnits) * (CANVAS_PX[size] / SCENE_H)).toFixed(1)}px`;
}
