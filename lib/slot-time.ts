/**
 * CONTEXT.md "Slot time" (spec 2026-10-17 R3): the ticket's time and how
 * early to arrive. The Item's own start time is the Traveller's plan; when
 * only a slot is set, start defaults to slot − arrive-by. Zod-free so the
 * Item form can show the default as it is typed.
 */

/** The largest arrive-by margin accepted: 12 hours. */
export const MAX_ARRIVE_BY_MINUTES = 720;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:mm" slot less the arrive-by minutes, clamped to 00:00 (an Item's start stays on its own date). */
export function defaultStartFromSlot(
  slot: string | null | undefined,
  arriveByMinutes: number | null | undefined,
): string | null {
  if (!slot || !HHMM_RE.test(slot)) return null;
  const [h, m] = slot.split(":").map(Number);
  const total = Math.max(0, h * 60 + m - Math.max(0, arriveByMinutes ?? 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
