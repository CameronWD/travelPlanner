# Unified ActionResult — single discriminated shape for mainstream server actions

## Context

Before this work, server actions returned at least six structurally different shapes:

| Shape | Example actions |
|---|---|
| `{ tripId?: string; error?: string }` | `createTrip`, `duplicateTrip` |
| `{ conflicts?: FlowConflict[]; error?: string }` | `reorderStops` |
| `{ id?: string; error?: string }` | `createReminder` |
| `{ ok: boolean }` | `push.ts` (calendar push) |
| Raw partial returns (no discriminant) | `share.ts` (share link) |
| Custom `AiResult` type | `ai.ts` (AI suggestions) |

Additionally, every action file contained its own `validationErrors` helper (or
equivalent) to flatten a `ZodError` into a field-keyed dict — approximately 12
copies of the same logic, each with slight structural variations (some used `z.ZodError`
directly; others called `.flatten()` differently; some omitted form-level errors).

The consequence was that client code could not safely assume *any* structural contract
across actions. Every consumer had its own error-display branch; each form dialog had
its own `isPending`/`errors` state wiring.

## Decision

### 1. A single discriminated type for the mainstream family

```ts
// lib/action-result.ts
export type ActionResult<TSuccess extends object = Record<never, never>> =
  | ({ success: true } & TSuccess)
  | { success: false; errors: FieldErrors };
```

The generic `TSuccess` is the **success-branch extension** — extra fields live
top-level on the success object, not nested. This preserves every existing caller
contract (e.g. `result.conflicts`, `result.id`) while giving all consumers a stable
discriminant (`result.success`).

`ActionResult` (no generic) is a plain success-or-failure with no extra payload.

### 2. Shared helpers replace ~12 hand-rolled validators

- `flattenZodErrors(error: ZodError): FieldErrors` — flattens a ZodError into a
  field-keyed dict. Per-field arrays that are `undefined` in the Zod output are
  normalised to `[]`. Schema/form-level errors appear under the `"_"` key, but only
  when present (callers must treat `errors["_"]` as possibly absent).
- `validationResult(error: ZodError): ActionFailure` — convenience wrapper:
  `{ success: false, errors: flattenZodErrors(error) }`.
- `ok(data?)` — builds the success branch.
- `fail(errors)` — builds the failure branch.

### 3. Adoption scope — mainstream family only

The following 11 actions were migrated to `ActionResult` + shared helpers:

`stops`, `transport`, `accommodation`, `items`, `costs`, `reminders`,
`schedule`, `chapters`, `globe` (Task 20 gap-close), `saveAsTemplate` partial,
`markers`.

Actions with typed payload fields use the generic:
- `reorderStops` → `ActionResult<{ conflicts?: FlowConflict[] }>`
- `createReminder` / `updateReminder` → `ActionResult<{ id?: string }>`
- `createCost` → `ActionResult<{ cost?: Pick<Cost, "id"> }>`
- `scheduleItem` → `ActionResult<{ placedItemId?: string }>`

### 4. Outliers — explicitly left and logged

The following actions were **not** migrated. They remain on their original shapes
and are not bugs — they are deliberate boundary decisions.

| Action | Shape kept | Reason |
|---|---|---|
| `push.ts` | `{ ok: boolean }` | Calendar-push semantics: a boolean flag, no field errors possible; the shape is intentionally minimal and unambiguous for its single consumer. |
| `share.ts` | Raw partial returns | Share-link generation returns a URL or throws; field-error semantics do not apply; no Zod validation in the path. |
| `ai.ts` | `AiResult` custom type | AI suggestion results carry structured multi-field payloads (suggestions array, model metadata) that do not map cleanly to `ActionResult`'s success-branch extension without a large generic. Kept as a separate domain type. |
| `trips.ts`, `forks.ts`, `attachments.ts` | `{ error?: string }` pattern | These actions predate the mainstream refactor and use a plain `error` string rather than field-keyed validation. Migrating them would require restructuring their callers. Deferred; log as a follow-up. |

## Consequences

- **Stable discriminant everywhere.** `useServerAction` and `useEntityForm` can
  branch on `result.success` without knowing which action they wrap.
- **~12 hand-rolled validators eliminated.** `validationResult(error)` is the single
  call site for Zod-to-`FieldErrors` conversion.
- **`"_"` key is conditional.** `flattenZodErrors` only emits `errors["_"]` when
  the Zod schema produces form-level errors. Client code that reads `errors["_"]`
  must treat it as possibly absent — do not assume it is always present.
- **`scheduleItem` success branch simplification.** The original `XActionResult`
  alias carried `placedItemId?` on both branches (an accident of the intersection
  approach). The generic correctly places it on the success branch only — callers
  that read `placedItemId` under a `success === true` guard are unaffected.
- **Outliers are visible, not hidden.** The four outlier shapes are documented here
  and in `COMPONENTS.md`. A future session may choose to unify `trips`/`forks`/
  `attachments` when their callers are restructured.
