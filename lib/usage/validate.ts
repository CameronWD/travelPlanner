import {
  ACTION_DETAILS,
  APP_SCREENS,
  FUTURE_SKEW_MS,
  MAX_APPEAR_MS,
  MAX_BATCH_RECORDS,
  MAX_DAY_OFFSET,
  OPEN_MODES,
  RETENTION_DAYS,
  USAGE_ACTIONS,
  USAGE_PHASES,
  USAGE_SCREENS,
  type OpenMode,
  type UsageAction,
  type UsageDetail,
  type UsagePhase,
  type UsageScreen,
} from "./lists";

export type UsageInput = {
  screen: UsageScreen | null;
  action: UsageAction | null;
  detail: UsageDetail | null;
  tripId: string | null;
  phase: UsagePhase | null;
  mode: OpenMode;
  appearMs: number | null;
  savedCopy: boolean;
  dayOffset: number | null;
  occurredAt: Date;
};

const DAY_MS = 86_400_000;
const MAX_ID_CHARS = 64;
const SCREEN_KEYS: ReadonlySet<string> = new Set(["screen", "at", "mode", "tripId", "phase", "ms", "saved", "dayOffset"]);
const ACTION_KEYS: ReadonlySet<string> = new Set(["action", "at", "mode", "detail", "tripId", "phase", "dayOffset"]);

function isIn<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(raw: unknown, now: number): UsageInput | null {
  if (!isPlainObject(raw)) return null;
  const has = (key: string) => Object.hasOwn(raw, key);
  const isScreen = has("screen");
  if (isScreen === has("action")) return null;
  const allowed = isScreen ? SCREEN_KEYS : ACTION_KEYS;
  if (Object.keys(raw).some((key) => !allowed.has(key))) return null;

  if (!isIntIn(raw.at, now - RETENTION_DAYS * DAY_MS, now + FUTURE_SKEW_MS)) return null;
  if (!isIn(OPEN_MODES, raw.mode)) return null;

  let tripId: string | null = null;
  let phase: UsagePhase | null = null;
  if (has("tripId")) {
    if (typeof raw.tripId !== "string" || raw.tripId.length < 1 || raw.tripId.length > MAX_ID_CHARS) return null;
    if (!isIn(USAGE_PHASES, raw.phase)) return null;
    tripId = raw.tripId;
    phase = raw.phase;
  } else if (has("phase")) {
    return null;
  }

  let dayOffset: number | null = null;
  if (has("dayOffset")) {
    if (!isIntIn(raw.dayOffset, -MAX_DAY_OFFSET, MAX_DAY_OFFSET)) return null;
    dayOffset = raw.dayOffset;
  }

  const base = { tripId, phase, mode: raw.mode, dayOffset, occurredAt: new Date(raw.at) };

  if (isScreen) {
    if (!isIn(USAGE_SCREENS, raw.screen)) return null;
    const screen = raw.screen;
    if (isIn(APP_SCREENS, screen) === (tripId !== null)) return null;
    if (dayOffset !== null && screen !== "day") return null;
    let appearMs: number | null = null;
    if (has("ms")) {
      if (!isIntIn(raw.ms, 0, MAX_APPEAR_MS)) return null;
      appearMs = raw.ms;
    }
    let savedCopy = false;
    if (has("saved")) {
      if (typeof raw.saved !== "boolean") return null;
      savedCopy = raw.saved;
    }
    return { ...base, screen, action: null, detail: null, appearMs, savedCopy };
  }

  if (!isIn(USAGE_ACTIONS, raw.action)) return null;
  const action = raw.action;
  if (action === "share-link-opened" && tripId !== null) return null;
  if (dayOffset !== null && action !== "day-changed") return null;
  const details: readonly UsageDetail[] | undefined = (ACTION_DETAILS as Partial<Record<UsageAction, readonly UsageDetail[]>>)[action];
  let detail: UsageDetail | null = null;
  if (details) {
    if (!isIn(details, raw.detail)) return null;
    detail = raw.detail;
  } else if (has("detail")) {
    return null;
  }
  return { ...base, screen: null, action, detail, appearMs: null, savedCopy: false };
}

export function parseUsageBatch(raw: unknown, now: number): { records: UsageInput[] } | null {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "records") return null;
  const { records } = raw;
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_BATCH_RECORDS) return null;
  const parsed: UsageInput[] = [];
  for (const record of records) {
    const input = parseRecord(record, now);
    if (input) parsed.push(input);
  }
  return { records: parsed };
}
