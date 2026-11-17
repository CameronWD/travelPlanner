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
