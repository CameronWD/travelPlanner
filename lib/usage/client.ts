import { daysBetween } from "@/lib/dates";
import { isStandalone } from "@/lib/standalone";
import { computeTripPhase } from "@/lib/trip-phase";
import { todayISOInZone } from "@/lib/tz";
import {
  ACTION_DETAILS,
  MAX_APPEAR_MS,
  MAX_BATCH_RECORDS,
  MAX_DAY_OFFSET,
  MAX_QUEUE,
  MORE_ROW_BY_LABEL,
  type ActionWire,
  type DayChangeMethod,
  type OpenMode,
  type ScreenWire,
  type UsageAction,
  type UsageDetail,
  type UsagePhase,
  type UsageScreen,
  type UsageWireRecord,
} from "./lists";

export type UsageTripContext = { tripId: string; startDate: string | null; endDate: string | null; zone: string };

type Stored = { u: string; r: UsageWireRecord[] };

const STORAGE_KEY = "teepee.usage.v1";
const ENDPOINT = "/api/usage";
const FLUSH_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;
const SEND_TIMEOUT_MS = 15_000;
// Timers can land a hair after the instant a back-off ends; without this the
// tick that should send would see "still waiting" and the wait would grow by a tick.
const TICK_SLACK_MS = 1_000;

let userId: string | null = null;
let stopped = false;
let pending: UsageWireRecord[] = [];
let memoryOnly = false;
let memory: Stored | null = null;
let currentTrip: UsageTripContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let failures = 0;
let waitUntil = 0;
let detach: (() => void) | null = null;

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function parseStored(raw: string | null): Stored | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { u, r } = value as Record<string, unknown>;
    if (typeof u !== "string" || u === "") return null;
    const records = Array.isArray(r)
      ? r.filter((x): x is UsageWireRecord => typeof x === "object" && x !== null && !Array.isArray(x))
      : [];
    return { u, r: records.slice(-MAX_QUEUE) };
  } catch {
    return null;
  }
}

function load(): Stored | null {
  if (!memoryOnly) {
    try {
      return parseStored(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      memoryOnly = true;
    }
  }
  return memory;
}

function save(next: Stored | null): void {
  memory = next && { u: next.u, r: next.r.slice(-MAX_QUEUE) };
  if (memoryOnly) return;
  try {
    if (memory) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    memoryOnly = true;
  }
}

function enqueue(record: UsageWireRecord): void {
  if (stopped) return;
  if (userId === null) {
    pending = [...pending, record].slice(-MAX_QUEUE);
    return;
  }
  const stored = load();
  const queued = stored && stored.u === userId ? stored.r : [];
  save({ u: userId, r: [...queued, record] });
}

function stop(): void {
  stopped = true;
  pending = [];
  stopTimer();
}

function startTimer(): void {
  if (timer === null && !stopped) timer = setInterval(flush, FLUSH_MS);
}

function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function removeSent(batch: readonly UsageWireRecord[]): void {
  const stored = load();
  if (!stored || stored.u !== userId) return;
  const sent = new Map<string, number>();
  for (const record of batch) {
    const key = JSON.stringify(record);
    sent.set(key, (sent.get(key) ?? 0) + 1);
  }
  const rest = stored.r.filter((record) => {
    const key = JSON.stringify(record);
    const left = sent.get(key) ?? 0;
    if (left === 0) return true;
    sent.set(key, left - 1);
    return false;
  });
  save({ u: stored.u, r: rest });
}

function backOff(startedAt: number): void {
  failures += 1;
  waitUntil = startedAt + Math.min(FLUSH_MS * 2 ** failures, MAX_BACKOFF_MS) - TICK_SLACK_MS;
}

function settle(res: Response, batch: readonly UsageWireRecord[], startedAt: number): Promise<void> | void {
  if (res.ok) {
    failures = 0;
    waitUntil = 0;
    removeSent(batch);
    return res.json().then(
      (body: unknown) => {
        if (typeof body === "object" && body !== null && (body as { recording?: unknown }).recording === false) {
          const stored = load();
          if (stored) save({ u: stored.u, r: [] });
          stop();
        }
      },
      () => {},
    );
  }
  if (res.status === 401) {
    save(null);
    stop();
    return;
  }
  if (res.status === 429 || res.status >= 500) {
    backOff(startedAt);
    return;
  }
  removeSent(batch);
}

function flush(): void {
  try {
    if (stopped || inFlight || userId === null) return;
    if (Date.now() < waitUntil) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const stored = load();
    if (!stored || stored.u !== userId || stored.r.length === 0) return;

    const batch = stored.r.slice(0, MAX_BATCH_RECORDS);
    const startedAt = Date.now();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), SEND_TIMEOUT_MS) : null;
    inFlight = true;
    let request: Promise<Response>;
    try {
      request = fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: batch }),
        keepalive: true,
        signal: controller?.signal,
      });
    } catch (err) {
      request = Promise.reject(err);
    }
    request
      .then(
        (res) => settle(res, batch, startedAt),
        () => backOff(startedAt),
      )
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        if (timeout !== null) clearTimeout(timeout);
      })
      .catch(() => {});
  } catch {
    inFlight = false;
  }
}

function install(): void {
  const onVisibility = () => {
    try {
      if (document.visibilityState === "visible") startTimer();
      else {
        stopTimer();
        flush();
      }
    } catch {}
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", flush);
  if (document.visibilityState === "visible") startTimer();
  detach = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("online", flush);
    stopTimer();
  };
}

function todayIn(zone: string): string {
  try {
    return todayISOInZone(zone);
  } catch {
    return todayISOInZone("UTC");
  }
}

function withTrip<T extends ScreenWire | ActionWire>(record: T, trip: UsageTripContext | null): T {
  if (!trip) return record;
  const phase = phaseNow(trip);
  return phase ? { ...record, tripId: trip.tripId, phase } : record;
}

function isDayOffset(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && Math.abs(value) <= MAX_DAY_OFFSET;
}

function recordAction(action: UsageAction, detail: UsageDetail | undefined, dayOffset: number | null): void {
  const details = (ACTION_DETAILS as Partial<Record<UsageAction, readonly UsageDetail[]>>)[action];
  if (details ? detail === undefined || !details.includes(detail) : detail !== undefined) return;
  let record: ActionWire = { action, at: Date.now(), mode: openMode() };
  if (detail !== undefined) record.detail = detail;
  record = withTrip(record, action === "share-link-opened" ? null : currentTrip);
  if (action === "day-changed" && record.tripId !== undefined && isDayOffset(dayOffset)) record.dayOffset = dayOffset;
  enqueue(record);
}

export function startUsage(id: string): void {
  try {
    if (!inBrowser() || stopped) return;
    userId = id;
    const stored = load();
    const queued = stored && stored.u === id ? stored.r : [];
    save({ u: id, r: [...queued, ...pending] });
    pending = [];
    if (!detach) install();
  } catch {}
}

export function setUsageTrip(trip: UsageTripContext | null): void {
  try {
    currentTrip = trip;
  } catch {}
}

export function currentUsageTrip(): UsageTripContext | null {
  try {
    return currentTrip;
  } catch {
    return null;
  }
}

export function recordUsageScreen(input: {
  screen: UsageScreen;
  ms: number | null;
  saved: boolean;
  dayOffset: number | null;
  trip: UsageTripContext | null;
}): void {
  try {
    if (!inBrowser()) return;
    let record: ScreenWire = { screen: input.screen, at: Date.now(), mode: openMode() };
    record = withTrip(record, input.trip);
    if (input.ms !== null && Number.isFinite(input.ms)) {
      const ms = Math.round(input.ms);
      if (ms >= 0 && ms <= MAX_APPEAR_MS) record.ms = ms;
    }
    if (input.saved === true) record.saved = true;
    if (input.screen === "day" && record.tripId !== undefined && isDayOffset(input.dayOffset)) record.dayOffset = input.dayOffset;
    enqueue(record);
  } catch {}
}

export function recordUsageAction(action: UsageAction, detail?: UsageDetail): void {
  try {
    if (!inBrowser()) return;
    recordAction(action, detail, null);
  } catch {}
}

export function recordUsageDayChange(method: DayChangeMethod, iso: string | null): void {
  try {
    if (!inBrowser()) return;
    const zone = currentTrip?.zone;
    recordAction("day-changed", method, iso !== null && zone ? dayOffsetFrom(iso, zone) : null);
  } catch {}
}

export function recordUsageSwipe(settledIso: string | null, viewIso: string): void {
  try {
    if (settledIso !== null && settledIso !== viewIso) recordUsageDayChange("swipe", settledIso);
  } catch {}
}

export function recordUsageMoreRow(label: string): void {
  try {
    const row = Object.prototype.hasOwnProperty.call(MORE_ROW_BY_LABEL, label) ? MORE_ROW_BY_LABEL[label] : undefined;
    if (row) recordUsageAction("more-row-chosen", row);
  } catch {}
}

export function sendUsageOnce(action: "share-link-opened"): void {
  try {
    if (!inBrowser() || stopped) return;
    if (!load()) return;
    const record: ActionWire = { action, at: Date.now(), mode: openMode() };
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: [record] }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function forgetUsage(): void {
  try {
    stop();
    memory = null;
    if (inBrowser()) window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function openMode(): OpenMode {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
    if (!window.matchMedia("(pointer: coarse)").matches) return "desktop";
    return isStandalone() ? "phone-app" : "phone-browser";
  } catch {
    return "desktop";
  }
}

export function phaseNow(trip: { startDate: string | null; endDate: string | null; zone: string }): UsagePhase | null {
  try {
    return computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today: todayIn(trip.zone) });
  } catch {
    return null;
  }
}

export function dayOffsetFrom(iso: string, zone: string): number | null {
  try {
    const offset = daysBetween(todayIn(zone), iso);
    return isDayOffset(offset) ? offset : null;
  } catch {
    return null;
  }
}

export function resetUsageForTests(): void {
  detach?.();
  detach = null;
  userId = null;
  stopped = false;
  pending = [];
  memoryOnly = false;
  memory = null;
  currentTrip = null;
  timer = null;
  inFlight = false;
  failures = 0;
  waitUntil = 0;
}
