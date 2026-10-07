/**
 * Whether the Trip on screen is Saved for offline (CONTEXT.md): the warmer
 * (components/offline-warmer.tsx) reports idle → saving → saved here, the
 * Settings row (components/trip/settings/saved-for-offline.tsx) reads it and
 * asks for a "Save again". The two live in different layouts, so a tiny
 * external store rather than context — the same shape as
 * lib/feedback-trip-store.ts.
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
  /** Bumped by requestWarm(); the warmer re-runs when it changes. */
  requestId: number;
}

const STORAGE_PREFIX = "teepee.offline.savedAt.";
const BUILD_STORAGE_PREFIX = "teepee.offline.savedBuild.";
const IDLE: OfflineStatus = { state: "idle", savedAt: null, savedBuild: null, requestId: 0 };

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
  const initial: OfflineStatus =
    savedAt === null ? IDLE : { ...IDLE, state: "saved", savedAt, savedBuild: readSavedBuild(tripId) };
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

export function beginWarm(tripId: string): void {
  update(tripId, { state: "saving" });
}

export function finishWarm(tripId: string, at: number = Date.now()): void {
  const build = currentBuildId();
  writeSavedAt(tripId, at, build);
  update(tripId, { state: "saved", savedAt: at, savedBuild: build });
}

/** A warm that stopped early (left the Trip, went offline) falls back to what was last known. */
export function cancelWarm(tripId: string): void {
  const current = getStatus(tripId);
  if (current.state !== "saving") return;
  update(tripId, { state: current.savedAt === null ? "idle" : "saved" });
}

/** Tests only: forget every Trip's in-memory state (storage is left alone). */
export function resetOfflineStatus(): void {
  statuses.clear();
  handledRequests.clear();
}
