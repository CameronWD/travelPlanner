# TEEPEE — Shared UI Primitives Cookbook

This file is the source of truth for the shared primitives extracted during the
`refactor/shared-ui-primitives-and-composables` branch. It covers:

- [Catalog](#catalog) — every primitive, its home, and its one-line purpose
- [Recipes](#recipes) — step-by-step patterns for the most common tasks
- [When to extract](#when-to-extract) — the tuned rule-of-three
- [Deliberately left duplicated](#deliberately-left-duplicated) — what was not unified, and why

See also: **`docs/adr/0026-shared-ui-conventions.md`** (extraction decisions) and
**`docs/adr/0027-unified-action-result.md`** (the unified result type).

---

## Catalog

| Primitive | File | Purpose |
|---|---|---|
| `ActionResult<T>` | `lib/action-result.ts` | Discriminated success/failure type for server actions. Generic `T` extends the success branch. |
| `ok()` / `ok(data)` | `lib/action-result.ts` | Build a success result, optionally with a payload. |
| `fail(errors)` | `lib/action-result.ts` | Build a failure result from a `FieldErrors` dict. |
| `flattenZodErrors(error)` | `lib/action-result.ts` | Flatten a `ZodError` to `FieldErrors`. Form-level errors appear under `"_"` only when present. |
| `validationResult(error)` | `lib/action-result.ts` | Convenience: `fail(flattenZodErrors(error))` in one call. |
| `useServerAction` | `components/ui/use-server-action.ts` | Wraps `useTransition` + `ActionResult` routing. Returns `{ run, isPending, errors, clearErrors }`. |
| `useEntityForm` | `components/ui/use-entity-form.ts` | Create/edit submit cycle built on `useServerAction`. Returns `{ errors, isPending, onSubmit }`. |
| `<FormDialog>` | `components/ui/form-dialog.tsx` | Dialog chrome with state-reset remount. Props: `open`, `onOpenChange`, `title`, `recordId?`. |
| `<RowActions>` | `components/ui/row-actions.tsx` | Edit (Pencil) / Delete (Trash2) ghost `size-8` icon-button pair. |
| `<SectionHeader>` | `components/ui/section-header.tsx` | Icon + `h3` heading + optional count + optional right-aligned action slot. |
| `createMapLoader<P>` | `components/ui/map-loader.tsx` | Factory: wraps a Leaflet component in `next/dynamic({ ssr:false })`. Returns a typed loader component. |
| `useDeleteWithConfirm` | `components/ui/use-delete-with-confirm.ts` | Confirm-then-delete. Composes `useConfirm` + `useServerAction`. Returns `{ requestDelete, isPending, dialog }`. |
| `<InlineCostFields>` | `components/trip/inline-cost-fields.tsx` | Estimated / actual / date-paid cost input trio for transport, accommodation, and item form dialogs. |

---

## Recipes

### Add a create/edit form dialog

Use `<FormDialog>` for the shell and `useEntityForm` for the submit cycle. Place the
stateful form fields as a child — `FormDialog` remounts them automatically when the
dialog opens or `recordId` changes, so controlled state re-seeds from props.

**Reference:** `components/trip/stop-form-dialog.tsx`

```tsx
// Minimal pattern (adapt to your entity):
<FormDialog
  open={open}
  onOpenChange={onOpenChange}
  title={stop ? "Edit stop" : "Add stop"}
  recordId={stop?.id ?? null}
>
  <StopForm stop={stop} tripId={tripId} onClose={() => onOpenChange(false)} onSaved={onSaved} />
</FormDialog>
```

Inside the inner form component:

```tsx
const { errors, isPending, onSubmit } = useEntityForm({
  submit: async () => {
    const input = buildInput();          // read refs / state
    return stop
      ? updateStop(stop.id, input)       // returns ActionResult
      : createStop(tripId, input);
  },
  onClose,
  onSaved,
});

return (
  <form onSubmit={onSubmit}>
    <Field label="Name" error={(errors as FormErrors).name?.[0]}>
      <Input … />
    </Field>
    <Button type="submit" disabled={isPending}>Save</Button>
  </form>
);
```

Notes:
- Keep a local `interface FormErrors` as a cast lens over the generic return:
  `(errors as FormErrors).name?.[0]`. Do not access field keys directly on `errors`
  without a cast — the generic type is `FieldErrors` (index-sig), not typed to your
  specific fields.
- `submit` must be a pure `() => Promise<ActionResult>` — no `async` keyword
  needed if it delegates to an action that already returns a promise.
- If the form includes inline cost inputs, add `<InlineCostFields errors={errors} …/>`.
  Pass `errors` **unwrapped** — `InlineCostFields.errors` is `FieldErrors` directly.
  See `components/trip/transport-form-dialog.tsx` for a full example.

---

### Call a server action from a client component

Use `useServerAction` when you need to invoke a server action outside a form
(e.g. a button that triggers a mutation, a non-form flow).

**Reference:** `components/trip/add-from-globe-dialog.tsx`

```tsx
const save = useServerAction(addMarkerToWishlist, {
  onSuccess: () => { toast.success("Added"); onClose(); },
  onError: (errors) => { if (errors["_"]) toast.error(errors["_"][0]); },
});

<Button onClick={() => save.run(markerId)} disabled={save.isPending}>
  Add to wishlist
</Button>
```

`run` is stable (safe as an event-handler ref). `errors` is reset to `{}` before
each run. Call `save.clearErrors()` if you need to dismiss errors manually.

---

### Delete with confirmation

Use `useDeleteWithConfirm`. You must render the returned `dialog` somewhere in the
tree (it's an invisible confirm-dialog mount).

**Reference:** `components/trip/stops-manager.tsx`

```tsx
const { requestDelete, isPending, dialog } = useDeleteWithConfirm({
  action: deleteStop,
  buildConfirm: (stopId) => ({
    title: "Delete stop?",
    description: "This cannot be undone.",
    confirmLabel: "Delete",
  }),
  onDeleted: (stopId) => onStopDeleted(stopId),
});

return (
  <>
    {dialog}
    <Button
      variant="destructive"
      disabled={isPending}
      onClick={() => requestDelete(stopId)}
    >
      Delete
    </Button>
  </>
);
```

---

### Add a Leaflet map

Use `createMapLoader` to produce a typed client-only loader. Call it once at
module level in a `"use client"` file.

**References:**
- `components/trip/route-map-loader.tsx` — single-prop map
- `components/trip/wishlist-map-loader.tsx` — map with callbacks
- `components/globe/globe-map-loader.tsx` — globe map

```tsx
// route-map-loader.tsx
"use client";
import { createMapLoader } from "@/components/ui/map-loader";
import type { RouteMapProps } from "./route-map";

export const RouteMapLoader = createMapLoader<RouteMapProps>(
  () => import("./route-map").then((m) => m.RouteMap),
);
```

Then use `<RouteMapLoader …/>` in any server or client component — the dynamic
import ensures Leaflet is never SSR'd.

---

### Edit / delete row buttons on a card

Use `<RowActions>`. It renders Pencil and Trash2 ghost icon buttons at `size-8`.
Omit `onEdit` or `onDelete` to hide that button.

**Reference:** `components/trip/transport-card.tsx`

```tsx
<RowActions
  onEdit={() => setEditing(true)}
  onDelete={() => requestDelete(transport.id)}
  editLabel="Edit transport"
  deleteLabel="Delete transport"
  disabled={isPending}
/>
```

> **Icon-button standard (resolved):** all icon buttons are now `size-8` via
> `<Button size="icon" className="size-8">` or `<RowActions>`. `<RowActions>` also
> adds a coarse-pointer 44 px touch expander so the tap target meets WCAG 2.5.5 on
> touch screens. See ADR 0029 for the full record.

---

### Section heading with icon and item count

Use `<SectionHeader>`. The `action` slot is right-aligned (e.g. an "Add" button).
Pass `count={undefined}` (or omit it) to suppress the count; `count={0}` renders "(0)".

**Reference:** `components/trip/wishlist-board.tsx`

```tsx
<SectionHeader
  icon={<ListChecks className="size-4 text-muted-foreground" />}
  title="Wishlist"
  count={items.length}
  action={<AddItemButton tripId={tripId} />}
/>
```

---

## When to extract

Extract a shared primitive only when **both** conditions hold:

1. **Frequency:** there are ≥ 3 near-identical copies across the codebase, OR the
   candidate is pure plumbing with zero domain knowledge (framework glue, not business
   logic).
2. **Honest shape:** the extracted interface stays honest — no per-consumer flags,
   no opt-out escape hatches, no leaking domain specifics. If making the shape honest
   requires a flag for every third consumer, the copies are divergent by design and
   should stay separate.

**Stop early** when the variation between copies reflects genuine design differences
rather than incidental divergence. Document the non-extraction here.

`<RowActions>` and `<SectionHeader>` are explicitly **below** the numeric rule-of-three
(2 usages each) but were extracted as forward-templates because both are pure plumbing.
A future reviewer may choose to inline them if a third usage does not materialise.

---

## Finalized UI conventions

These conventions were established during the `refactor/ui-refinement-consistency-pass`
branch and are now the project standard. See **ADR 0029** for the authoritative record.

### Icon-button size standard

All icon buttons: `size-8` (`2rem / 32 px`). Use `<Button size="icon" className="size-8">`
for standalone icon buttons; use `<RowActions>` for the standard edit/delete pair.
`<RowActions>` attaches a `@media (pointer: coarse)` pseudo-element that expands the
touch target to 44 px to meet WCAG 2.5.5.

### Copy voice

| Context | Rule | Example |
|---|---|---|
| Action labels & dialog titles | **Title Case** | "Add Stop", "Edit Transport", "Delete Reminder" |
| Empty-state / help text | Sentence case + period | "No stops yet. Add one to get started." |

### Card treatment (single standard)

All trip-surface cards use this shell:
- Background: `bg-card` (opaque)
- Shape: `rounded-xl`
- Shadow: `shadow-soft`
- Padding: `px-4 py-3`
- Inner gap: `gap-2.5`

### Money tokens

| Token | Colour | Use |
|---|---|---|
| `text-success` / `bg-success` | Green | Under-estimate / positive delta |
| `text-over` / `bg-over` | Rose (`--over: 350 78% 50%`) | Over-estimate / negative delta |
| `text-warning` / `bg-warning` | Amber | Warning / caution state |

Use `text-over` (not `text-destructive`) when displaying an over-budget amount — `destructive`
is reserved for errors and destructive actions.

---

## Deliberately left duplicated

These patterns were assessed and intentionally **not** unified. They are not gaps.

### Tier-C: did not meet the extraction bar

| Pattern | Consumer(s) | Reason not extracted |
|---|---|---|
| `useDisclosure` / `useFormDialog` | All dialog trigger sites | Trivial `useState(false)` + open/close callbacks. Abstracting adds a layer with no complexity benefit. |
| Soft date-order warning badges | `transport-form-dialog`, `accommodation-form-dialog` | 2 consumers, domain-specific logic (date comparison), no shared structure. |
| dnd-kit drag-reorder | `itinerary-manager` | Single consumer; ADR 0014/0021 logic is highly specific to the stop-reorder domain. |
| `CardCostSection` | Varies per card | Each card's cost display is over-fit to its own layout; a shared component would require too many flags. |
| Relative-time display | `activity-feed`, `reminder-card` | 2 consumers with different formatting granularity (seconds vs. days). |
| Card container shell (`CardShell`) | 8 card components | 5+ divergent card families (rounded-2xl/p-5/Link; shadcn Card; py-4; bg-muted/30; bg-card/60+shadow-soft). A pure ≥3-card shell isn't achievable without structural flags — leaky abstraction. Task 19 decision. |
| Action guard + revalidate wrapper | `server/actions/` | Revalidate path-sets are too divergent across actions; the only ≥3 shared set is file-local to `forks.ts`. Task 20 decision. |

### ActionResult outliers (left on their original shapes)

| Action file | Shape kept | Reason |
|---|---|---|
| `push.ts` | `{ ok: boolean }` | Calendar-push result: a boolean flag, no field errors possible; intentionally minimal. |
| `share.ts` | Raw partial returns | Share-link generation returns a URL or throws; field-error semantics don't apply. |
| `ai.ts` | `AiResult` | Multi-field AI result payload (suggestions array, model metadata) does not map to `ActionResult`'s success-branch extension without a large generic. Kept as a separate domain type. |
| `trips.ts`, `forks.ts`, `attachments.ts` | `{ error?: string }` | Use a plain error string, not field-keyed validation. Migrating requires restructuring their callers. Deferred. |

### Migration skips (shape divergence)

**`<RowActions>` not adopted at:**
- `accommodation-card` — icon size `size-9`
- `item-card` — icon size `size-7` with NoteThread component interleaved
- `stop-card` — NoteThread + MoreActionsMenu interleaved with row actions
- `cost-editor` — Pencil (edit) + X (cancel mode), not Pencil + Trash2; size `size-6`

**`<SectionHeader>` not adopted at:**
- `marker-list` — uses `text-xs uppercase` styling (different typographic treatment)
- itinerary chapter headers — interactive buttons with drag handle, chapter chip, dates, and chevron
- `countdown-hero` — vertical `span` + `p` pair, not a horizontal icon + heading row

**`useDeleteWithConfirm` not adopted at:**
- `chapters-manager` — chapter deletion needs error display (`conflicts` result) that the hook's interface cannot carry
- `wishlist-board`, `itinerary-manager` — deletion uses an undo-toast pattern, not a confirm dialog

### ~~Open visual-consistency follow-up~~ RESOLVED (ADR 0029)

Icon buttons are now normalised to `size-8` everywhere via
`<Button size="icon" className="size-8">` / `<RowActions>`. `<RowActions>` adds
a coarse-pointer 44 px touch expander. See **ADR 0029** for the full decision
record. This follow-up is closed.

### Minor technical notes

- `flattenZodErrors` emits `errors["_"]` **only when** the Zod schema produces
  form-level (non-field) errors. Callers must treat `errors["_"]` as possibly absent.
- `<SectionHeader count={0}>` renders the string `"(0)"`. Pass `count={undefined}`
  or omit the prop to suppress the count entirely.
- `<FormDialog>` key string is `` `${recordId ?? "new"}-open` `` (when open) /
  `"closed"` (when closed) (vs the old per-dialog `"${id}-${open}"` which embedded
  the literal "true"). Functionally equivalent remount behaviour; only snapshot tests
  asserting the exact key string would be affected (none exist).
- `scheduleItem` success branch: the original `XActionResult` alias carried
  `placedItemId?` on both branches (an intersection accident). The generic correctly
  places it on the success branch only — callers under a `success === true` guard
  are unaffected.
