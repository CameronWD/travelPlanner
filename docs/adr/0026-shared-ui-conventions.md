# Shared UI Conventions — primitives, homes, and the tuned rule-of-three

## Context

As TEEPEE matured past its initial feature set, a handful of patterns accumulated
across the planning surface with no shared implementations:

- **Create/edit dialogs:** each of the seven entity form dialogs (Stop, Transport,
  Accommodation, Item, Chapter, Schedule, Marker) owned its own Dialog chrome, its
  own `useState` for transition/errors, and its own `prevent-default → clear →
  dispatch → close → notify` submit cycle. The pattern was identical; the code was
  not.

- **Mutation hooks:** every client component that invoked a server action called
  `useTransition` directly, managed its own `errors` state, and wrote its own
  routing of `ActionResult` branches to field display or callback. Same branching
  logic, different wiring, every time.

- **Leaflet map loaders:** three files each duplicated a `next/dynamic({ ssr:false })`
  wrapper for a Leaflet component — the only thing that varied was the import path.

- **Delete-with-confirm:** the confirm-then-delete flow (open confirm dialog, only
  run the delete action on confirmation) was hand-wired with a `useConfirm` + bare
  `useTransition` call in each consumer.

- **Card row actions:** Pencil/Trash ghost icon-button pairs recurred across card
  components with minor size or label variations.

- **Section headers:** Icon + heading + count rows appeared on the wishlist board
  and other surfaces with no shared markup.

- **Inline cost fields:** the identical estimated/actual/paid trio of cost inputs
  was copy-pasted across the transport, accommodation, and item form dialogs.

The natural next step was to extract the ≥3-identical-copy patterns into shared
primitives, apply a considered rule about when to stop, and record both the
primitives and the deliberate non-extractions.

## Decision

### 1. Primitives extracted and their homes

**`lib/` — framework-agnostic result type and helpers**

- `lib/action-result.ts` — `ActionResult<TSuccess extends object>`, `ok()`, `fail()`,
  `flattenZodErrors()`, `validationResult()`. See ADR 0027.

**`components/ui/` — generic hooks and components (no domain knowledge)**

- `use-server-action.ts` — `useServerAction`: wraps `useTransition`, routes
  `ActionResult` to `errors` state or `onSuccess`/`onError` callbacks. Returns
  `{ run, isPending, errors, clearErrors }`.
- `use-entity-form.ts` — `useEntityForm`: the shared create/edit submit cycle built
  on top of `useServerAction`. Owns `preventDefault → clear → run(submit thunk) →
  onClose + onSaved / errors`. Returns `{ errors, isPending, onSubmit }`.
- `form-dialog.tsx` — `<FormDialog>`: Dialog chrome (Dialog + DialogContent +
  DialogHeader/Title) with a state-reset remount via a keyed `<div key={formKey}>`.
  `formKey = open ? "${recordId ?? "new"}-open" : "closed"`.
- `row-actions.tsx` — `<RowActions>`: the Edit (Pencil) / Delete (Trash2) ghost
  `size-8` icon-button pair. Props: `onEdit?`, `onDelete?`, `editLabel?`,
  `deleteLabel?`, `disabled?`, `className?`.
- `section-header.tsx` — `<SectionHeader>`: Icon + `h3` heading + optional count
  + optional right-aligned action slot.
- `map-loader.tsx` — `createMapLoader<P>`: factory that wraps a Leaflet component
  import in `next/dynamic({ ssr:false })`. One-liner usage per map.
- `use-delete-with-confirm.ts` — `useDeleteWithConfirm`: confirm-then-delete hook.
  Composes `useConfirm` + `useServerAction`. Returns `{ requestDelete, isPending,
  dialog }` — render `dialog` in the tree.

**`components/trip/` — domain-shaped components (trip-specific knowledge)**

- `inline-cost-fields.tsx` — `<InlineCostFields>`: the estimated/actual/paid cost
  input trio shared by transport, accommodation, and item form dialogs. Conditionally
  renders actual + paid only when an estimate is entered; hidden when
  `hasMultipleCosts` is true.

### 2. The tuned rule-of-three

Extract only when **both** conditions hold:

1. **Frequency:** ≥ 3 near-identical copies exist across the codebase, OR the
   candidate is pure plumbing with no domain knowledge (framework glue, not business
   logic).
2. **Honest shape:** extraction produces a component or hook whose interface stays
   honest — no flags, no opt-outs, no per-consumer escape hatches — meaning the
   shared shape is the real shape.

Stop extracting when the variation between copies reflects genuine design differences
(different sizes, interleaved sibling components, different action shapes) rather than
incidental divergence. In that case the duplication is intentional and should be
logged, not unified.

### 3. Borderline extractions kept as forward-templates

`<RowActions>` and `<SectionHeader>` each landed at 2 active usages — below the
numeric rule-of-three. They are kept because:
- Both are pure plumbing with zero domain knowledge.
- Both establish the correct shared shape for future consumers.
- Inlining them would cost more at the third usage than the extraction cost now.

These are explicitly noted as borderline. A future reviewer may choose to inline
them if a third usage does not materialise.

## Consequences

- **Consistency:** all seven entity form dialogs now share the same Dialog chrome,
  submit cycle, and error-display contract. The reference pattern is
  `components/trip/stop-form-dialog.tsx`.
- **Reduced surface area:** `useServerAction` and `useEntityForm` replace ~14
  independent `useTransition` + errors-state blocks. `createMapLoader` collapses
  three map-loader files to one-liners.
- **The when-to-extract bar is recorded.** Future contributors should consult the
  rule above and `COMPONENTS.md` before extracting a new primitive.
- **Deliberate left-duplicated items are logged.** The patterns that were *not*
  unified — and why — are listed in `COMPONENTS.md` under "Deliberately left
  duplicated." They are not gaps; they are intentional.
- **`<RowActions>` is `size-8` ghost.** Existing card sites that use `size-6`,
  `size-7`, or `size-9` icon buttons were not migrated (shape divergence; would
  require design decisions outside this refactor's preserve-scope). See
  `COMPONENTS.md` for the open visual-consistency follow-up.
