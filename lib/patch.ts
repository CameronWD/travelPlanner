/**
 * The PATCH contract every update action takes (ADR 0075, spec 2026-10-14
 * card 3.L): an update names only what changes.
 *
 *  - a field left `undefined` (or absent) keeps its current value;
 *  - a field set to `null` is cleared;
 *  - any other value replaces it — `""`, `0` and `false` included.
 *
 * The action holds the row, merges the patch onto it here, validates the
 * merged whole with the entity's existing schema, then writes. A form still
 * sends its full input; `toPatch` turns the fields it left empty into `null`
 * so they clear rather than keep. Zod-free and React-free: client forms
 * import `toPatch` (lib/client-zod.guard.test.ts).
 */

/** Every field optional; `null` clears it. */
export type Patch<T> = { [K in keyof T]?: T[K] | null };

/**
 * One field of a patch against its current value. `undefined` (the schemas'
 * "no value") comes back for a cleared field and for a current `null`, so the
 * result feeds a zod schema whose optional fields are `.optional()`.
 */
export function patched<V>(next: V | null | undefined, current: V | null | undefined): V | undefined {
  if (next === undefined) return current ?? undefined;
  return next ?? undefined;
}

/**
 * Merge a patch onto the current values (a row's columns, `null` for none).
 * A key the row doesn't carry (an inline Cost field, `surpriseForIds`)
 * passes through from the patch. The result is what the action hands its
 * schema — `Partial`, because the schema, not this, decides what is required.
 */
export function applyPatch<T extends object>(current: Patch<T>, patch: Patch<T>): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * A form's full input as a PATCH: each `clearable` field the form left empty
 * (absent or `undefined`) is sent as `null`, so the save clears it instead of
 * keeping the old value. List only fields whose emptiness means "clear" — a
 * derived field (a Stop's point), an "omit = leave alone" field
 * (`surpriseForIds`) or a field the form never shows stays out of the list.
 */
export function toPatch<T extends object>(input: T, clearable: readonly (keyof T)[]): Patch<T> {
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of clearable) {
    if (out[key as string] === undefined) out[key as string] = null;
  }
  return out as Patch<T>;
}
