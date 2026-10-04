/**
 * Which day sections of the desktop open Stop card a Traveller has folded
 * (spec 2026-10-04 §A). A per-viewer convenience: every day starts open, and
 * only the folded ones are kept — per Trip, in localStorage, as a JSON list
 * of `<stopId>:<date>` keys, so a Changeover day folds separately under each
 * of its two Stops. Storage that throws or holds junk reads as "every day
 * open"; a write that throws still folds the day until the next reload.
 *
 * Pure module, no React: StopOpenBody subscribes through useSyncExternalStore
 * (the same shape as lib/offline-status.ts).
 */

const STORAGE_PREFIX = "teepee.plan.collapsedDays.";
const EMPTY: ReadonlySet<string> = new Set();

/** Filled only when localStorage refused a write; wins over storage until a write gets through. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function dayCollapseKey(stopId: string, dateISO: string): string {
  return `${stopId}:${dateISO}`;
}

/** The stored list as its raw string — a stable snapshot for useSyncExternalStore. "" when nothing is stored or storage can't be read. */
export function readCollapsedRaw(tripId: string): string {
  const remembered = memory.get(tripId);
  if (remembered !== undefined) return remembered;
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + tripId) ?? "";
  } catch {
    return "";
  }
}

export function parseCollapsed(raw: string): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? new Set(value.filter((v): v is string => typeof v === "string")) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function setDayCollapsed(tripId: string, stopId: string, dateISO: string, collapsed: boolean): void {
  const next = new Set(parseCollapsed(readCollapsedRaw(tripId)));
  const key = dayCollapseKey(stopId, dateISO);
  if (next.has(key) === collapsed) return;
  if (collapsed) next.add(key);
  else next.delete(key);
  const raw = next.size > 0 ? JSON.stringify([...next]) : "";
  try {
    if (raw) window.localStorage.setItem(STORAGE_PREFIX + tripId, raw);
    else window.localStorage.removeItem(STORAGE_PREFIX + tripId);
    memory.delete(tripId);
  } catch {
    // Full or blocked (private mode): fold it for this visit anyway.
    memory.set(tripId, raw);
  }
  for (const listener of listeners) listener();
}

export function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: forget the in-memory fallback. */
export function resetDayCollapse(): void {
  memory.clear();
}
