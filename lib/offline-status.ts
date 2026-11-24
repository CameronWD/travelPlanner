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
  total: number | null;
  saved: number | null;
  // When the last run ended, whether or not it saved everything: the row's time for a shortfall.
  ranAt: number | null;
  // The last run lost a page or a page's asset (a file never counts): the next automatic open warms again.
  pagesFailed: boolean;
  // The Trip changed since its pages were last saved: the next automatic open warms them again.
  pagesStale: boolean;
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
const IDLE: OfflineStatus = { state: "idle", savedAt: null, savedBuild: null, total: null, saved: null, ranAt: null, pagesFailed: false, pagesStale: false, requestId: 0 };

/** This deploy's build id (inlined by next.config.ts), "dev" when unset. */
export function currentBuildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID || "dev";
}

const statuses = new Map<string, OfflineStatus>();
const listeners = new Set<() => void>();
/** Per Trip, the requestId the warmer last acted on (see takeWarmRequest). */
const handledRequests = new Map<string, number>();
// Which came first, a run's start or the Trip going stale: a run that began
// before the change holds pre-change pages, so it must not clear the flag.
let ordinal = 0;
const warmStarts = new Map<string, number>();
const staleMarks = new Map<string, number>();

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

function readCounts(tripId: string): Pick<OfflineStatus, "total" | "saved" | "ranAt" | "pagesFailed" | "pagesStale"> {
  const none = { total: null, saved: null, ranAt: null, pagesFailed: false, pagesStale: false };
  if (typeof window === "undefined") return none;
  try {
    const raw = window.localStorage.getItem(COUNTS_STORAGE_PREFIX + tripId);
    if (!raw) return none;
    const { total, saved, at, pagesFailed, pagesStale } = JSON.parse(raw) as Record<string, unknown>;
    if (typeof total !== "number" || typeof saved !== "number" || typeof at !== "number") return none;
    return { total, saved, ranAt: at, pagesFailed: pagesFailed === true, pagesStale: pagesStale === true };
  } catch {
    return none;
  }
}

function writeCounts(tripId: string, total: number, saved: number, at: number, pagesFailed: boolean, pagesStale: boolean) {
  try {
    window.localStorage.setItem(COUNTS_STORAGE_PREFIX + tripId, JSON.stringify({ total, saved, at, pagesFailed, pagesStale }));
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

export function isIncomplete(status: OfflineStatus): boolean {
  return status.total !== null && status.saved !== null && status.saved < status.total;
}

export function beginWarm(tripId: string): void {
  warmStarts.set(tripId, ++ordinal);
  update(tripId, { state: "saving" });
}

// A run that lost a page keeps its counts but not a new savedAt, and is
// flagged so the next automatic open warms the pages again however fresh an
// older savedAt is. A run that lost only a file is stamped: files are retried
// on every run by their own cache check, so re-fetching every page would add
// nothing.
export function finishWarm(tripId: string, result: WarmResult, at: number = Date.now()): void {
  const pagesFailed = result.pagesFailed > 0;
  const marked = staleMarks.get(tripId);
  const changedMidRun = marked !== undefined && (warmStarts.get(tripId) ?? 0) < marked;
  const pagesStale = changedMidRun && getStatus(tripId).pagesStale;
  if (!pagesStale) staleMarks.delete(tripId);
  writeCounts(tripId, result.total, result.saved, at, pagesFailed, pagesStale);
  const counts = { total: result.total, saved: result.saved, ranAt: at, pagesFailed, pagesStale };
  if (pagesFailed) {
    update(tripId, { state: "saved", ...counts });
    return;
  }
  const build = currentBuildId();
  writeSavedAt(tripId, at, build);
  update(tripId, { state: "saved", savedAt: at, savedBuild: build, ...counts });
}

// An edit made to the Trip leaves the saved pages one change behind. Counts
// are only stored once a run has finished; before that the flag is in memory
// and the first save warms the pages anyway.
export function markPagesStale(tripId: string): void {
  staleMarks.set(tripId, ++ordinal);
  const current = getStatus(tripId);
  if (current.total !== null && current.saved !== null && current.ranAt !== null) {
    writeCounts(tripId, current.total, current.saved, current.ranAt, current.pagesFailed, true);
  }
  update(tripId, { pagesStale: true });
}

// A run inside the fresh window fetches only files. What it lost or got back
// changes the counts the row reads, never savedAt: the pages were not fetched.
export function recordFileShortfall(tripId: string, files: { total: number; saved: number }, at: number = Date.now()): void {
  const current = getStatus(tripId);
  const missing = files.total - files.saved;
  if (current.total === null && missing === 0) return;
  const total = current.total ?? files.total;
  const saved = Math.max(0, total - missing);
  if (current.total === total && current.saved === saved) return;
  writeCounts(tripId, total, saved, at, false, current.pagesStale);
  update(tripId, { total, saved, ranAt: at });
}

/** A warm that stopped early (left the Trip, went offline) falls back to what was last known. */
export function cancelWarm(tripId: string): void {
  const current = getStatus(tripId);
  if (current.state !== "saving") return;
  update(tripId, { state: current.savedAt === null && current.ranAt === null ? "idle" : "saved" });
}

const ALL_STORAGE_PREFIX = "teepee.offline.";

// Sign-out empties the cache, so every Trip's "Saved for offline" goes with it.
export function forgetOfflineSaves(): void {
  try {
    const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(ALL_STORAGE_PREFIX));
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: the in-memory state below is still forgotten.
  }
  for (const [tripId, status] of statuses) statuses.set(tripId, { ...IDLE, requestId: status.requestId });
  notify();
}

/** Tests only: forget every Trip's in-memory state (storage is left alone). */
export function resetOfflineStatus(): void {
  statuses.clear();
  handledRequests.clear();
  warmStarts.clear();
  staleMarks.clear();
}
