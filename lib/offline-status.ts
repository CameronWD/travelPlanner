/**
 * Whether the Trip on screen is Saved for offline (CONTEXT.md): the warmer
 * (components/offline-warmer.tsx) reports idle → saving → saved here, the
 * Settings row (components/trip/settings/saved-for-offline.tsx) reads it and
 * asks for a "Save again". The two live in different layouts, so a tiny
 * external store rather than context — the same shape as
 * lib/feedback/trip-store.ts.
 *
 * `savedAt` is kept in localStorage per Trip so the row still says "Saved
 * for offline · 2h ago" after a reload, when the in-memory state is gone but
 * the service worker cache is not. It is the spec's "warmedAt" (spec
 * 2026-10-06 §A): only a run that warmed the pages updates it, so the
 * 6-hour skip in the warmer can't keep extending itself.
 *
 * `savedBuild` is the deploy (NEXT_PUBLIC_BUILD_ID) that save ran under, kept
 * beside `savedAt`. Pages Saved for offline reference that build's CSS/JS
 * chunks, so after a deploy the warmer treats the save as stale and re-warms
 * on the first open. A save from before this field existed has no build and
 * counts as stale too.
 */

type OfflineSaveState = "idle" | "saving" | "saved";

export interface OfflineStatus {
  state: OfflineSaveState;
  /** Epoch ms of the last completed warm; null when none has finished. */
  savedAt: number | null;
  /** The build the last completed warm ran under; null when unknown. */
  savedBuild: string | null;
  /** Pages and files the last finished run tried to save; null when unknown. */
  total: number | null;
  /** How many of `total` it saved. */
  saved: number | null;
  /** Epoch ms the last finished run ended, complete or not; null when none has. */
  ranAt: number | null;
  /** Bumped by requestWarm(); the warmer re-runs when it changes. */
  requestId: number;
}

export interface WarmResult {
  total: number;
  saved: number;
  pagesFailed: number;
}

const STORAGE_PREFIX = "teepee.offline.savedAt.";
const BUILD_STORAGE_PREFIX = "teepee.offline.savedBuild.";
const COUNTS_STORAGE_PREFIX = "teepee.offline.counts.";
const IDLE: OfflineStatus = { state: "idle", savedAt: null, savedBuild: null, total: null, saved: null, ranAt: null, requestId: 0 };

/** This deploy's build id (inlined by next.config.ts), "dev" when unset. */
export function currentBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID || "dev";
}

const statuses = new Map<string, OfflineStatus>();
const listeners = new Set<() => void>();
/** Per Trip, the requestId the warmer last acted on (see takeWarmRequest). */
const handledRequests = new Map<string, number>();

function notify() {
  for (const listener of listeners) listener();
}

function readSavedAt(tripId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tripId);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function readSavedBuild(tripId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BUILD_STORAGE_PREFIX + tripId) || null;
  } catch {
    return null;
  }
}

function readCounts(tripId: string): Pick<OfflineStatus, "total" | "saved" | "ranAt"> {
  const none = { total: null, saved: null, ranAt: null };
  if (typeof window === "undefined") return none;
  try {
    const raw = window.localStorage.getItem(COUNTS_STORAGE_PREFIX + tripId);
    if (!raw) return none;
    const { total, saved, at } = JSON.parse(raw) as Record<string, unknown>;
    if (typeof total !== "number" || typeof saved !== "number" || typeof at !== "number") return none;
    return { total, saved, ranAt: at };
  } catch {
    return none;
  }
}

function writeCounts(tripId: string, total: number, saved: number, at: number) {
  try {
    window.localStorage.setItem(COUNTS_STORAGE_PREFIX + tripId, JSON.stringify({ total, saved, at }));
  } catch {
    // Same as writeSavedAt: the in-memory state still updates.
  }
}

function writeSavedAt(tripId: string, at: number, build: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tripId, String(at));
    window.localStorage.setItem(BUILD_STORAGE_PREFIX + tripId, build);
  } catch {
    // Storage full or blocked (private mode): the in-memory state still
    // updates, so the row is right until the next reload.
  }
}

function update(tripId: string, patch: Partial<OfflineStatus>) {
  statuses.set(tripId, { ...getStatus(tripId), ...patch });
  notify();
}

export function getStatus(tripId: string): OfflineStatus {
  const known = statuses.get(tripId);
  if (known) return known;
  const savedAt = readSavedAt(tripId);
  const counts = readCounts(tripId);
  const initial: OfflineStatus =
    savedAt === null && counts.ranAt === null
      ? IDLE
      : { ...IDLE, ...counts, state: "saved", savedAt, savedBuild: savedAt === null ? null : readSavedBuild(tripId) };
  statuses.set(tripId, initial);
  return initial;
}

/** Nothing is known before hydration — keeps useSyncExternalStore SSR-safe. */
export function getServerStatus(): OfflineStatus {
  return IDLE;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** "Save again": the warmer subscribed to this Trip re-runs its warm. */
export function requestWarm(tripId: string): void {
  update(tripId, { requestId: getStatus(tripId).requestId + 1 });
}

/**
 * True exactly once per "Save again": the first warm run after requestWarm()
 * bumped this Trip's requestId. Any other run is the automatic warm on
 * opening the Trip (spec 2026-10-06 §A), which may skip its page paths.
 */
export function takeWarmRequest(tripId: string): boolean {
  const { requestId } = getStatus(tripId);
  const handled = handledRequests.get(tripId) ?? 0;
  handledRequests.set(tripId, requestId);
  return requestId !== handled;
}

/** The last finished run saved fewer than it tried; never "0 of 0". */
export function isIncomplete(status: OfflineStatus): boolean {
  return status.total !== null && status.saved !== null && status.saved < status.total;
}

export function beginWarm(tripId: string): void {
  update(tripId, { state: "saving" });
}

/**
 * A run with a failed page records its counts but leaves `savedAt` alone, so
 * the 6-hour skip never treats an incomplete save as fresh.
 */
export function finishWarm(tripId: string, result: WarmResult, at: number = Date.now()): void {
  writeCounts(tripId, result.total, result.saved, at);
  const counts = { total: result.total, saved: result.saved, ranAt: at };
  if (result.pagesFailed > 0) {
    update(tripId, { state: "saved", ...counts });
    return;
  }
  const build = currentBuildId();
  writeSavedAt(tripId, at, build);
  update(tripId, { state: "saved", savedAt: at, savedBuild: build, ...counts });
}

/** A warm that stopped early (left the Trip, went offline) falls back to what was last known. */
export function cancelWarm(tripId: string): void {
  const current = getStatus(tripId);
  if (current.state !== "saving") return;
  update(tripId, { state: current.savedAt === null && current.ranAt === null ? "idle" : "saved" });
}

/** Tests only: forget every Trip's in-memory state (storage is left alone). */
export function resetOfflineStatus(): void {
  statuses.clear();
  handledRequests.clear();
}
