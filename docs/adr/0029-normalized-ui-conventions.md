# Normalized UI Conventions — icon-button size, copy voice, card treatment, and money tokens

## Status

Accepted — supersedes the "Open visual-consistency follow-up" recorded in ADR 0026.

## Context

ADR 0026 (`shared-ui-conventions.md`) closed the shared-primitives extraction pass and
left one explicit open item:

> **Open visual-consistency follow-up:** Card edit/delete icon buttons use inconsistent
> sizes across the codebase (`size-6`, `size-7`, `size-8`, `size-9`). Normalising to
> `size-8` everywhere and adopting `<RowActions>` at the skipped sites above would
> improve visual consistency, but is a design change … Requires a deliberate decision
> before implementation.

The `refactor/ui-refinement-consistency-pass` branch addressed that follow-up and
simultaneously established three additional conventions (copy voice, card shell, money
tokens) that were previously implicit or inconsistent. This ADR records all four
decisions so they can be referenced as the project standard.

## Decision

### 1. Icon-button size — `size-8` everywhere

All icon buttons across the trip surface use `size-8` (`2rem / 32 px`).

**Implementation:**
- Standalone icon buttons: `<Button size="icon" className="size-8">`.
- Edit/delete pairs: `<RowActions>` (already renders `size-8` ghost buttons).
- `<RowActions>` adds a `@media (pointer: coarse)` pseudo-element that expands
  the hit area to 44 px × 44 px, meeting WCAG 2.5.5 on touch screens.

Sites previously on `size-6`, `size-7`, or `size-9` have been migrated. Known
structural exceptions (e.g. `cost-editor`, which uses Pencil + X rather than
Pencil + Trash2, and `stop-card` / `item-card` with interleaved components) were
assessed and updated or annotated individually.

### 2. Copy voice

| Context | Rule |
|---|---|
| Action-label buttons and dialog titles | **Title Case** — "Add Stop", "Edit Transport", "Delete Reminder" |
| Empty-state messages and help text | **Sentence case + period** — "No stops yet. Add one to get started." |

These rules are applied at every existing and future action label, dialog title,
empty state, and tooltip in the trip surface.

### 3. Card treatment — single standard shell

All trip-surface cards use a single opaque shell:

```
bg-card   rounded-xl   shadow-soft   px-4 py-3   gap-2.5
```

Previously cards mixed `rounded-2xl`, `rounded-xl`, `shadow-sm`, `shadow-soft`,
translucent backgrounds (`bg-card/60`), and varying padding. The single shell
resolves those inconsistencies. The `shadow-soft` utility maps to the warm-tinted
CSS custom property defined in `app/globals.css`.

### 4. Money / delta tokens — `over` for negative, `success` for positive

| Token | Colour | Semantics |
|---|---|---|
| `text-success` / `bg-success` | Green | Under-estimate; positive budget delta |
| `text-over` / `bg-over` | Rose (`--over: 350 78% 50%` light / `350 80% 62%` dark) | Over-estimate; negative budget delta |
| `text-warning` / `bg-warning` | Amber | Warning / caution — not a directional delta |

`text-over` (not `text-destructive`) is the correct token for over-budget amounts.
`destructive` is reserved for error states and destructive actions (delete
confirmations, form submission errors). The `--over` CSS custom property was added to
`app/globals.css` in this pass and mapped in the Tailwind v4 `@theme inline` block.

## Consequences

- **Consistency:** icon buttons, copy, card chrome, and money colours now have a single
  documented standard; new components should follow it without needing to inspect
  existing code.
- **Accessibility:** the 44 px coarse-pointer touch target on `<RowActions>` meets
  WCAG 2.5.5 (Target Size — Enhanced) for the most common row-action pattern.
- **ADR 0026 follow-up closed:** the "Open visual-consistency follow-up" noted in ADR
  0026 is resolved by decision 1 above. The `COMPONENTS.md` entry has been updated
  accordingly.
- **`COMPONENTS.md` updated:** the "Finalized UI conventions" section records the
  practical cheat-sheet; this ADR records the rationale.
