/**
 * What a Reminder is about (CONTEXT.md "Reminder", spec 2026-10-16 F8): one
 * Stop, one Item or one Transport leg — never several — or nothing (the Trip
 * as a whole). The Postgres CHECK "Reminder_about_one_thing_check" and
 * reminderSchema both hold "at most one"; this module is the shared,
 * pure half: the read shape, the leg label, and the patch rule. Client-safe
 * (no db, no zod) — components import the label helpers and the picker codec.
 */
import { TRANSPORT_MODE_META } from "@/lib/transport";

export const ABOUT_KEYS = ["stopId", "itemId", "transportId"] as const;
export type AboutKey = (typeof ABOUT_KEYS)[number];
export type ReminderAbout = { stopId: string } | { itemId: string } | { transportId: string };

/**
 * A Reminder as Home, the Checklists page, the plan's cards and get_reminders
 * render it. Each `*Id` is set when the Reminder is about that thing; its
 * name (`stopName` / `itemTitle` / `transportLabel`) is joined at read time.
 * All null (never omitted) for a Reminder about the Trip as a whole.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  stopId: string | null;
  stopName: string | null;
  itemId: string | null;
  itemTitle: string | null;
  transportId: string | null;
  transportLabel: string | null;
}

/** What the add form's "About" picker offers (lib/reminder-reads.ts readReminderAboutOptions). */
export interface ReminderAboutOptions {
  stops: { id: string; name: string }[];
  items: { id: string; title: string }[];
  transports: { id: string; label: string }[];
}

export const REMINDER_TRANSPORT_SELECT = {
  mode: true,
  depPlace: true,
  arrPlace: true,
  depIsHome: true,
  arrIsHome: true,
  fromStop: { select: { name: true } },
  toStop: { select: { name: true } },
  trip: { select: { homeName: true } },
} as const;

export interface ReminderTransportRow {
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depIsHome: boolean;
  arrIsHome: boolean;
  fromStop: { name: string } | null;
  toStop: { name: string } | null;
  trip: { homeName: string | null };
}

/** The one select every Reminder read uses, so each surface shows the same thing. */
export const REMINDER_ITEM_SELECT = {
  id: true,
  title: true,
  date: true,
  notes: true,
  stopId: true,
  stop: { select: { name: true } },
  itemId: true,
  item: { select: { title: true } },
  transportId: true,
  transport: { select: REMINDER_TRANSPORT_SELECT },
} as const;

export interface ReminderReadRow {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  stopId: string | null;
  stop: { name: string } | null;
  itemId: string | null;
  item: { title: string } | null;
  transportId: string | null;
  transport: ReminderTransportRow | null;
}

/** How many of the three about ids are set. reminderSchema refuses more than one. */
export function aboutCount(r: Partial<Record<AboutKey, string | null | undefined>>): number {
  return ABOUT_KEYS.filter((k) => r[k] != null && r[k] !== "").length;
}

/**
 * The update rule (ADR 0075 PATCH, spec F8): a patch that names ANY about key
 * replaces the whole about — the keys it leaves out are cleared — so a
 * Reminder moved from a Stop to an Item never holds both (the CHECK would
 * refuse the write). A patch naming none keeps the about as it is.
 */
// `P extends object` with the about keys intersected on the parameter, not
// `P extends Partial<Record<AboutKey, …>>`: that constraint is a "weak type",
// and TS refuses a patch that names no about key at all ({ title }).
export function replaceAbout<P extends object>(patch: P & Partial<Record<AboutKey, string | null | undefined>>): P {
  if (ABOUT_KEYS.every((k) => patch[k] === undefined)) return patch;
  const out: Record<string, unknown> = { ...patch };
  for (const k of ABOUT_KEYS) if (out[k] === undefined) out[k] = null;
  return out as P;
}

const PICK_PREFIX: Record<AboutKey, string> = { stopId: "stop", itemId: "item", transportId: "transport" };

/** The picker's option value for a thing: "stop:<id>", "item:<id>" or "transport:<id>". */
export function aboutPickValue(about: ReminderAbout): string {
  const key = ABOUT_KEYS.find((k) => k in about)!;
  return `${PICK_PREFIX[key]}:${(about as Record<AboutKey, string>)[key]}`;
}

/** The picker's value back to the action's fields; "" (the whole Trip) or anything unknown → {}. */
export function aboutFromPick(value: string): Partial<Record<AboutKey, string>> {
  const at = value.indexOf(":");
  if (at < 0) return {};
  const prefix = value.slice(0, at);
  const id = value.slice(at + 1);
  const key = ABOUT_KEYS.find((k) => PICK_PREFIX[k] === prefix);
  return key && id ? { [key]: id } : {};
}

const MODE_LABEL = TRANSPORT_MODE_META as Partial<Record<string, { label: string }>>;

/** "Train Paris → Lyon": the leg's mode and its two ends, as a Reminder's chip names it. */
export function reminderTransportLabel(t: ReminderTransportRow): string {
  const word = MODE_LABEL[t.mode]?.label ?? "Transport";
  const home = t.trip.homeName ?? "home";
  const from = t.depIsHome ? home : (t.fromStop?.name ?? t.depPlace);
  const to = t.arrIsHome ? home : (t.toStop?.name ?? t.arrPlace);
  return from && to ? `${word} ${from} → ${to}` : word;
}

export function toReminderItem(r: ReminderReadRow): ReminderItem {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    notes: r.notes,
    stopId: r.stopId,
    stopName: r.stop?.name ?? null,
    itemId: r.itemId,
    itemTitle: r.item?.title ?? null,
    transportId: r.transportId,
    transportLabel: r.transport ? reminderTransportLabel(r.transport) : null,
  };
}

/** The name of what the Reminder is about, for its chip; null when it is about the Trip as a whole. */
export function reminderAboutLabel(r: Pick<ReminderItem, "stopName" | "itemTitle" | "transportLabel">): string | null {
  return r.stopName ?? r.itemTitle ?? r.transportLabel ?? null;
}
