/**
 * CONTEXT.md "Try list" (spec 2026-10-17 R6): a small tickable list inside one
 * Item — the things to try, see or buy while you are there. Shared by everyone
 * on the Trip, and by a thing to do and the copies placed from it (each row
 * holds a copy; writes go to the whole family, lib/item-family.ts). Not a
 * Checklist: no due dates, no assignees, never on the Checklists page.
 *
 * Stored as a JSON string on `Item.tryList` (validated by
 * lib/validations/try-list.ts; an empty list is stored as null). This module is
 * the zod-free model, so components can import it.
 */

export interface TryEntry {
  id: string;
  text: string;
  tried: boolean;
}
export type TryList = TryEntry[];

/** One entry as a writer sends it: `id` names an existing entry; `tried` omitted keeps its tick (a new entry starts untried). */
export interface TryEntryInput {
  id?: string;
  text: string;
  tried?: boolean;
}

export const MAX_TRY_ENTRIES = 30;
export const MAX_TRY_TEXT = 80;
export const TRY_ENTRY_ID_LENGTH = 8;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A short random entry id not in `taken`. Minted server-side only: callers never choose ids. */
export function newTryEntryId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(TRY_ENTRY_ID_LENGTH));
    const id = Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
    if (!taken.has(id)) return id;
  }
}

/**
 * Replace `current` with `input`, in input order (the Item dialog, MCP
 * set_try_list). An input id matching a current entry keeps that id, and its
 * tick unless `tried` is given. Any other entry (no id, an unknown id, or an id
 * already used earlier in the input) gets a fresh id and starts untried unless
 * `tried` is given. Text is taken as given: the schema has already trimmed it.
 */
export function applyTryListInput(current: TryList | null, input: readonly TryEntryInput[]): TryList {
  const byId = new Map((current ?? []).map((e) => [e.id, e]));
  // Reserve every id that will be kept, so a fresh id never collides with one kept later in the input.
  const taken = new Set(input.flatMap((e) => (e.id && byId.has(e.id) ? [e.id] : [])));
  const used = new Set<string>();
  return input.map((e) => {
    const existing = e.id && !used.has(e.id) ? byId.get(e.id) : undefined;
    if (existing) {
      used.add(existing.id);
      return { id: existing.id, text: e.text, tried: e.tried ?? existing.tried };
    }
    const id = newTryEntryId(taken);
    taken.add(id);
    return { id, text: e.text, tried: e.tried ?? false };
  });
}

/** The list with one entry ticked (or unticked); null when there is no such entry. */
export function withEntryTried(list: TryList | null, entryId: string, tried: boolean): TryList | null {
  if (!list || !list.some((e) => e.id === entryId)) return null;
  return list.map((e) => (e.id === entryId ? { ...e, tried } : e));
}

/** Every entry untried, ids and text kept (Duplicate trip: a fresh Trip has tried nothing yet). */
export function untickAll(list: TryList | null): TryList | null {
  return list ? list.map((e) => ({ ...e, tried: false })) : null;
}

/** "2/5 tried" counts; null when there is no list. */
export function tryListProgress(list: TryList | null | undefined): { tried: number; total: number } | null {
  if (!list || list.length === 0) return null;
  return { tried: list.filter((e) => e.tried).length, total: list.length };
}

/** The Timeline's count: "2/5 tried"; null when there is no list. */
export function triedLabel(list: TryList | null | undefined): string | null {
  const progress = tryListProgress(list);
  return progress ? `${progress.tried}/${progress.total} tried` : null;
}

const SUMMARY_NAMES = 5;

/** One line for the Activity feed: up to five entries by name, then "+N more". */
export function tryListSummary(list: TryList): string {
  const names = list.slice(0, SUMMARY_NAMES).map((e) => e.text).join(", ");
  const more = list.length - SUMMARY_NAMES;
  return more > 0 ? `${names} +${more} more` : names;
}

/** True when both lists name the same entries in the same order. Ticks are ignored: a tick is not a list edit. */
export function sameTryEntries(a: TryList | null | undefined, b: TryList | null | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((e, i) => e.text === y[i].text);
}
