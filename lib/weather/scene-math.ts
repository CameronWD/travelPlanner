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

// The widest weather card the Day view renders at each height
// (app/(app)/trips/[tripId]/day/[date]/page.tsx):
// - compact, below md: 767px viewport less 2 x 24px page padding = 719px, 140px tall;
// - regular, md to lg, full width: 1023px less the 96px dock and 2 x 32px padding = 863px, 236px tall.
// Scenes are drawn 236 units tall and scale with the card, so a compact card
// shows more scene units across than a regular one of the same width.
const SCENE_H = 236;
const WIDEST_CARDS = [{ width: 719, height: 140 }, { width: 863, height: 236 }];
const widestInUnits = Math.max(...WIDEST_CARDS.map((c) => (c.width * SCENE_H) / c.height));
export const SCATTER_W = Math.ceil(widestInUnits / 20) * 20 + 40;
