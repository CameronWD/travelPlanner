# Shared UI Primitives & Composables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the patterns this codebase already repeats (form-dialogs, client mutations, action-result shapes, row actions, map loaders, cost fields) into a small set of well-named shared components + composables, migrate the existing call-sites onto them, and document them as a referenceable template.

**Architecture:** A three-layer extraction. (1) A shared `lib/action-result.ts` fixes the server-action result contract and kills the duplicated Zod-flatten helper. (2) Client composables in `components/ui/` (`useServerAction`, `useEntityForm`, `useDeleteWithConfirm`) own the `useTransition`→action→error/success plumbing. (3) Presentational primitives (`<FormDialog>`, `<RowActions>`, `<SectionHeader>`, `<InlineCostFields>`, `createMapLoader`) own the repeated JSX. Every existing call-site is then migrated onto them. Migrations are behaviour-preserving — existing co-located tests are the regression net.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Zod v4, Radix UI, Tailwind v4, Vitest + @testing-library/react.

## Global Constraints

- **Refactor policy = preserve + fix-in-path only.** Every task's diff must read as *either* a mechanical extraction *or* a single deliberate, called-out fix — never a blend. Behaviour, visual output, and design tokens are unchanged unless a task explicitly says otherwise.
- **Tuned rule-of-three.** Only extract patterns with ≥3 near-identical copies OR pure mechanical plumbing, AND where the shared shape stays honest (no flag-soup). Anything deliberately left duplicated goes on the follow-up log (Task 21), not silently.
- **`ActionResult` reach.** Unify only the mainstream family (`{ success: true } | { success: false; errors }` and its payload/`conflicts` variants). LEAVE the genuine outliers untouched and logged: `push.ts` (`{ ok }`), `share.ts` (raw returns), `ai.ts` (`AiResult<T>`), and the `error: string` actions in `trips.ts`/`forks.ts`/`attachments.ts`.
- **Existing tests stay green throughout.** Never edit a test to make a refactor pass unless the task explicitly authorises it (only Task 1/3/4/5/6/14/15/16/17 add *new* tests; migration tasks add none and edit none).
- **Homes:** generic hooks + generic components → `components/ui/` (follows the `use-toast.ts`/`use-online-status.ts` precedent). Domain-shaped shared components → `components/trip/`. Result type + helpers → `lib/`.
- **No dependency changes, no `app/` route restructuring, no touching business logic** (budget, firm-up, flags, compare, geocode, daylight, etc.) beyond the action-result boundary.
- **`CONTEXT.md` is not touched** — this pass introduces implementation, not domain terms; the glossary stays implementation-free.
- Test command: `npx vitest run <path>` for one file, `npm test` for the suite. Lint: `npm run lint`. Build: `npm run build`.
- All work is on branch `refactor/shared-ui-primitives-and-composables`. Do NOT merge or deploy.

---

## File Structure

**Created:**
- `lib/action-result.ts` — `ActionResult<T>`, `ActionFailure`, `FieldErrors`, `ok()`, `fail()`, `flattenZodErrors()`, `validationResult()`
- `lib/action-result.test.ts`
- `components/ui/use-server-action.ts` — `useServerAction`
- `components/ui/use-server-action.test.tsx`
- `components/ui/use-entity-form.ts` — `useEntityForm`
- `components/ui/use-entity-form.test.tsx`
- `components/ui/form-dialog.tsx` — `<FormDialog>`
- `components/ui/form-dialog.test.tsx`
- `components/ui/row-actions.tsx` — `<RowActions>`
- `components/ui/row-actions.test.tsx`
- `components/ui/section-header.tsx` — `<SectionHeader>`
- `components/ui/section-header.test.tsx`
- `components/ui/map-loader.tsx` — `createMapLoader()`
- `components/ui/use-delete-with-confirm.ts` — `useDeleteWithConfirm`
- `components/ui/use-delete-with-confirm.test.tsx`
- `components/trip/inline-cost-fields.tsx` — `<InlineCostFields>`
- `components/trip/inline-cost-fields.test.tsx`
- `docs/adr/0026-shared-ui-conventions.md`
- `docs/adr/0027-unified-action-result.md`
- `COMPONENTS.md`

**Modified (migrations):** the 11 `server/actions/*.ts` with a local `validationErrors` helper; `stop/transport/accommodation/item/chapter-form-dialog.tsx`; `schedule-item-dialog.tsx`; `components/globe/marker-form.tsx`; `add-from-globe-dialog.tsx`; the 6 `*-card.tsx`/manager row-action sites; the 4 section-header sites; the 3 `*-map-loader.tsx`; the plain confirm→delete sites; `ONBOARDING.md`.

---

## Phase 0 — Foundation (lib)

### Task 1: `ActionResult<T>` type + error helpers

**Files:**
- Create: `lib/action-result.ts`
- Test: `lib/action-result.test.ts`

**Interfaces:**
- Produces:
  - `type FieldErrors = Record<string, string[]>`
  - `type ActionFailure = { success: false; errors: FieldErrors }`
  - `type ActionResult<TSuccess extends object = Record<never, never>> = ({ success: true } & TSuccess) | ActionFailure`
  - `function ok(): ActionResult` and `function ok<T extends object>(data: T): ActionResult<T>`
  - `function fail(errors: FieldErrors): ActionFailure`
  - `function flattenZodErrors(error: ZodError): FieldErrors` — maps `fieldErrors` (undefined → `[]`) and surfaces `formErrors` under the `"_"` key (superset of every existing local helper, so output is identical where no form-level errors exist)
  - `function validationResult(error: ZodError): ActionFailure`

- [ ] **Step 1: Write the failing test**

```ts
// lib/action-result.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ok, fail, flattenZodErrors, validationResult } from "./action-result";

describe("ok", () => {
  it("returns a plain success", () => {
    expect(ok()).toEqual({ success: true });
  });
  it("spreads a payload onto the success branch", () => {
    expect(ok({ tripId: "t1" })).toEqual({ success: true, tripId: "t1" });
  });
});

describe("fail", () => {
  it("wraps a field-error dict", () => {
    expect(fail({ name: ["Required"] })).toEqual({
      success: false,
      errors: { name: ["Required"] },
    });
  });
});

describe("flattenZodErrors", () => {
  it("maps field errors and defaults missing arrays to []", () => {
    const schema = z.object({ name: z.string().min(1), age: z.number() });
    const parsed = schema.safeParse({ name: "", age: 5 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const errors = flattenZodErrors(parsed.error);
      expect(errors.name.length).toBeGreaterThan(0);
    }
  });
  it("surfaces form-level errors under the _ key", () => {
    const schema = z.string().min(3);
    const parsed = schema.safeParse("a");
    if (!parsed.success) {
      const errors = flattenZodErrors(parsed.error);
      expect(errors._.length).toBeGreaterThan(0);
    }
  });
});

describe("validationResult", () => {
  it("returns a failure result from a ZodError", () => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse({ name: "" });
    if (!parsed.success) {
      const result = validationResult(parsed.error);
      expect(result.success).toBe(false);
      expect(result.errors.name.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/action-result.test.ts`
Expected: FAIL — cannot find module `./action-result`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/action-result.ts
import type { ZodError } from "zod";

/** Field-keyed validation errors. Form-level errors live under the "_" key. */
export type FieldErrors = Record<string, string[]>;

/** The single failure shape every mainstream action shares. */
export type ActionFailure = { success: false; errors: FieldErrors };

/**
 * Discriminated result for server actions.
 *
 * The generic is the *success-branch extension*: `ActionResult` is a plain
 * success|failure, `ActionResult<{ conflicts?: FlowConflict[] }>` adds fields
 * to the success branch only. This preserves every existing caller contract —
 * payload fields stay top-level (e.g. `result.tripId`), never nested.
 */
export type ActionResult<TSuccess extends object = Record<never, never>> =
  | ({ success: true } & TSuccess)
  | ActionFailure;

/** Build a success result, optionally spreading a payload onto it. */
export function ok(): ActionResult;
export function ok<T extends object>(data: T): ActionResult<T>;
export function ok<T extends object>(data?: T): ActionResult<T> {
  return { success: true, ...(data ?? {}) } as ActionResult<T>;
}

/** Build a failure result from a field-error dict. */
export function fail(errors: FieldErrors): ActionFailure {
  return { success: false, errors };
}

/**
 * Flatten a ZodError into `FieldErrors`. Missing per-field arrays become `[]`;
 * schema/form-level errors are surfaced under the "_" key. This is the superset
 * of the ~11 hand-rolled `validationErrors` helpers it replaces.
 */
export function flattenZodErrors(error: ZodError): FieldErrors {
  const flat = error.flatten();
  const fieldErrors: FieldErrors = {};
  for (const [key, msgs] of Object.entries(
    flat.fieldErrors as Record<string, string[] | undefined>,
  )) {
    fieldErrors[key] = msgs ?? [];
  }
  if (flat.formErrors.length > 0) {
    fieldErrors["_"] = flat.formErrors;
  }
  return fieldErrors;
}

/** Convenience: a failure result straight from a ZodError. */
export function validationResult(error: ZodError): ActionFailure {
  return { success: false, errors: flattenZodErrors(error) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/action-result.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run lint`
Expected: no errors in the new file.

```bash
git add lib/action-result.ts lib/action-result.test.ts
git commit -m "feat(lib): shared ActionResult type + Zod error helpers"
```

---

### Task 2: Adopt the shared result type in mainstream actions

**Files (modify — the 11 with a local `validationErrors`/`flatten().fieldErrors` helper):**
`server/actions/accommodation.ts`, `costs.ts`, `checklists.ts`, `journal.ts`, `items.ts`, `reminders.ts`, `trips.ts`, `chapters.ts`, `transport.ts`, `stops.ts`, `notes.ts`

**Interfaces:**
- Consumes: `ActionResult`, `ActionFailure`, `validationResult`, `flattenZodErrors` from `@/lib/action-result` (Task 1).
- Produces: unchanged *runtime* behaviour and unchanged public result shapes (type aliases keep their names).

This is a **mechanical, behaviour-preserving** change applied to each file. Do NOT touch action logic, guards, revalidate calls, or the `error: string`/`ok` outlier actions.

**Per-file transformation (canonical example — `chapters.ts`):**

Before:
```ts
export type ChapterActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

function validationErrors(error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } }): ChapterActionResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, msgs] of Object.entries(error.flatten().fieldErrors)) {
    fieldErrors[k] = msgs ?? [];
  }
  return { success: false, errors: fieldErrors };
}
```

After:
```ts
import { type ActionResult, validationResult } from "@/lib/action-result";

export type ChapterActionResult = ActionResult;
```
…and replace every `return validationErrors(parsed.error);` with `return validationResult(parsed.error);`, and delete the local `validationErrors` function.

**Shape mapping for the non-plain aliases (retype, don't restructure):**
- `stops.ts`: `export type StopActionResult = ActionResult<{ conflicts?: FlowConflict[] }>;` (keep `ReorderResult` exactly as-is — it has a required `changed` + `conflicts`; leave its bespoke union).
- `reminders.ts`: `export type ReminderActionResult = ActionResult<{ id?: string }>;`
- `costs.ts`: `export type CostActionResult = ActionResult<{ cost?: Pick<Cost, "id"> }>;`
- `items.ts`: `ItemActionResult = ActionResult;` (scheduleItem's `placedItemId?` — if it's declared inline on the return, retype that action as `Promise<ActionResult<{ placedItemId?: string }>>`; otherwise leave).
- `journal.ts`, `notes.ts`, `votes.ts`, `checklists.ts`, `transport.ts`, `accommodation.ts`: `= ActionResult;`
- `trips.ts`: replace the helper + retype ONLY `CreateTripResult`/`UpdateTripResult` (the field-error ones) as `ActionResult<{ tripId: string }>` / `ActionResult`. **LEAVE** `SetHardEndDateResult`/`DeleteTripResult`/`DuplicateTripResult` (they use `error: string`) untouched → add to follow-up log.

- [ ] **Step 1: Apply the transformation to all 11 files** (one file at a time).
- [ ] **Step 2: Run each file's existing test after editing it**

Run per file, e.g.: `npx vitest run server/actions/chapters.test.ts`
Expected: PASS (unchanged behaviour). If a test references the deleted local `validationErrors`, that's a signal the change altered output — stop and reconcile.

- [ ] **Step 3: Run the full action test suite**

Run: `npx vitest run server/actions`
Expected: PASS.

- [ ] **Step 4: Lint + commit**

```bash
git add server/actions lib/action-result.ts
git commit -m "refactor(actions): adopt shared ActionResult + validationResult in mainstream actions"
```

---

## Phase 1 — Core client composables (`components/ui`)

### Task 3: `useServerAction`

**Files:**
- Create: `components/ui/use-server-action.ts`
- Test: `components/ui/use-server-action.test.tsx`

**Interfaces:**
- Consumes: `ActionResult`, `FieldErrors` from `@/lib/action-result`.
- Produces:
```ts
interface UseServerActionOptions<TArgs extends unknown[], TSuccess extends object> {
  onSuccess?: (result: { success: true } & TSuccess, ...args: TArgs) => void;
  onError?: (errors: FieldErrors, ...args: TArgs) => void;
}
function useServerAction<TArgs extends unknown[], TSuccess extends object = Record<never, never>>(
  action: (...args: TArgs) => Promise<ActionResult<TSuccess>>,
  options?: UseServerActionOptions<TArgs, TSuccess>,
): { run: (...args: TArgs) => void; isPending: boolean; errors: FieldErrors; clearErrors: () => void };
```

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/use-server-action.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useServerAction } from "./use-server-action";

describe("useServerAction", () => {
  it("routes a failure result into errors and calls onError", async () => {
    const action = vi.fn(async () => ({ success: false as const, errors: { name: ["Required"] } }));
    const onError = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onError }));

    act(() => result.current.run());
    await waitFor(() => expect(result.current.errors.name).toEqual(["Required"]));
    expect(onError).toHaveBeenCalledWith({ name: ["Required"] });
    expect(result.current.isPending).toBe(false);
  });

  it("calls onSuccess and clears errors on a success result", async () => {
    const action = vi.fn(async () => ({ success: true as const }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onSuccess }));

    act(() => result.current.run());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(result.current.errors).toEqual({});
  });

  it("passes run() args through to the action and callbacks", async () => {
    const action = vi.fn(async (_id: string) => ({ success: true as const }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onSuccess }));

    act(() => result.current.run("abc"));
    await waitFor(() => expect(action).toHaveBeenCalledWith("abc"));
    expect(onSuccess).toHaveBeenCalledWith({ success: true }, "abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/use-server-action.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// components/ui/use-server-action.ts
"use client";

import * as React from "react";
import type { ActionResult, FieldErrors } from "@/lib/action-result";

export interface UseServerActionOptions<
  TArgs extends unknown[],
  TSuccess extends object,
> {
  /** Runs after a successful result. Receives the success result + the run() args. */
  onSuccess?: (result: { success: true } & TSuccess, ...args: TArgs) => void;
  /** Runs after a failure result. Receives the field errors + the run() args. */
  onError?: (errors: FieldErrors, ...args: TArgs) => void;
}

/**
 * Wraps a server action in `useTransition`, routing its `ActionResult` into
 * `errors` state (for field display) or the `onSuccess`/`onError` callbacks.
 * `run` is stable across renders; the latest `action`/`options` are read via refs.
 */
export function useServerAction<
  TArgs extends unknown[],
  TSuccess extends object = Record<never, never>,
>(
  action: (...args: TArgs) => Promise<ActionResult<TSuccess>>,
  options?: UseServerActionOptions<TArgs, TSuccess>,
) {
  const [isPending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const actionRef = React.useRef(action);
  actionRef.current = action;
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const clearErrors = React.useCallback(() => setErrors({}), []);

  const run = React.useCallback((...args: TArgs) => {
    setErrors({});
    startTransition(async () => {
      const result = await actionRef.current(...args);
      if (!result.success) {
        setErrors(result.errors);
        optionsRef.current?.onError?.(result.errors, ...args);
        return;
      }
      optionsRef.current?.onSuccess?.(result, ...args);
    });
  }, []);

  return { run, isPending, errors, clearErrors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/use-server-action.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/use-server-action.ts components/ui/use-server-action.test.tsx
git commit -m "feat(ui): useServerAction composable"
```

---

### Task 4: `useEntityForm`

**Files:**
- Create: `components/ui/use-entity-form.ts`
- Test: `components/ui/use-entity-form.test.tsx`

**Interfaces:**
- Consumes: `useServerAction` (Task 3), `ActionResult`, `FieldErrors`.
- Produces:
```ts
function useEntityForm<TSuccess extends object = Record<never, never>>(opts: {
  submit: () => Promise<ActionResult<TSuccess>>;   // closes over built input + create|update choice
  onSaved?: () => void;
  onClose?: () => void;
}): { errors: FieldErrors; isPending: boolean; onSubmit: (e: React.FormEvent) => void };
```

Rationale: create/update have different arities per entity, so the caller supplies one `submit` thunk that builds the input and picks the action. `useEntityForm` owns the shared block: `preventDefault → clear errors → run → success closes+notifies / failure sets errors`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/use-entity-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEntityForm } from "./use-entity-form";

function fakeEvent() {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

describe("useEntityForm", () => {
  it("on success: closes, notifies, no errors", async () => {
    const submit = vi.fn(async () => ({ success: true as const }));
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useEntityForm({ submit, onSaved, onClose }));

    const e = fakeEvent();
    act(() => result.current.onSubmit(e));
    expect(e.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.errors).toEqual({});
  });

  it("on failure: surfaces errors, does not close", async () => {
    const submit = vi.fn(async () => ({ success: false as const, errors: { name: ["Required"] } }));
    const onClose = vi.fn();
    const { result } = renderHook(() => useEntityForm({ submit, onClose }));

    act(() => result.current.onSubmit(fakeEvent()));
    await waitFor(() => expect(result.current.errors.name).toEqual(["Required"]));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found).**

Run: `npx vitest run components/ui/use-entity-form.test.tsx`

- [ ] **Step 3: Write the implementation**

```ts
// components/ui/use-entity-form.ts
"use client";

import * as React from "react";
import { useServerAction } from "@/components/ui/use-server-action";
import type { ActionResult } from "@/lib/action-result";

/**
 * The shared submit cycle for an entity create/edit form: prevent default,
 * clear errors, run the (create|update) thunk, then close + notify on success
 * or surface field errors on failure. Pair with `<FormDialog>`.
 */
export function useEntityForm<TSuccess extends object = Record<never, never>>(opts: {
  /** Builds the input and dispatches create OR update; returns the ActionResult. */
  submit: () => Promise<ActionResult<TSuccess>>;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  const { run, isPending, errors } = useServerAction(
    () => optsRef.current.submit(),
    {
      onSuccess: () => {
        optsRef.current.onClose?.();
        optsRef.current.onSaved?.();
      },
    },
  );

  const onSubmit = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    run();
  }, [run]);

  return { errors, isPending, onSubmit };
}
```

- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add components/ui/use-entity-form.ts components/ui/use-entity-form.test.tsx
git commit -m "feat(ui): useEntityForm composable"
```

---

### Task 5: `<FormDialog>` shell

**Files:**
- Create: `components/ui/form-dialog.tsx`
- Test: `components/ui/form-dialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`.
- Produces:
```ts
interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Record id when editing, undefined/null when adding — drives the state-reset remount. */
  recordId?: string | null;
  children: React.ReactNode;
}
function FormDialog(props: FormDialogProps): React.ReactElement;
```

Owns: the Dialog + DialogContent + header chrome AND the remount trick. Children (a stateful inner `<XForm>`) are wrapped in a keyed `<div className="contents">` whose key changes with open/recordId — remounting the form so its `useState(prop ?? …)` re-seeds. `className="contents"` keeps it layout-neutral. This replaces the per-form `formKey` boilerplate and the hand-passed inner-form `key`.

- [ ] **Step 1: Write the failing test** (proves the remount resets inner state)

```tsx
// components/ui/form-dialog.test.tsx
import { describe, it, expect } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { FormDialog } from "./form-dialog";

function Counter({ seed }: { seed: string }) {
  const [value] = React.useState(seed);
  return <div data-testid="seed">{value}</div>;
}

describe("FormDialog", () => {
  it("renders the title and children when open", () => {
    render(
      <FormDialog open onOpenChange={() => {}} title="Add a stop" recordId={null}>
        <Counter seed="new" />
      </FormDialog>,
    );
    expect(screen.getByText("Add a stop")).toBeInTheDocument();
    expect(screen.getByTestId("seed")).toHaveTextContent("new");
  });

  it("remounts children (re-seeding state) when recordId changes", () => {
    const { rerender } = render(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="a">
        <Counter seed="a" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("a");

    rerender(
      <FormDialog open onOpenChange={() => {}} title="Edit" recordId="b">
        <Counter seed="b" />
      </FormDialog>,
    );
    expect(screen.getByTestId("seed")).toHaveTextContent("b");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found).**

Run: `npx vitest run components/ui/form-dialog.test.tsx`

- [ ] **Step 3: Write the implementation**

```tsx
// components/ui/form-dialog.tsx
"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /**
   * The id of the record being edited, or null/undefined when adding. Combined
   * with `open` to key the inner form so all its controlled state re-seeds from
   * props whenever the dialog opens or the target record changes.
   */
  recordId?: string | null;
  children: React.ReactNode;
}

/**
 * Standard shell for an entity create/edit dialog: the Dialog + content frame,
 * a header/title, and the state-reset remount. Put a stateful inner `<XForm>`
 * (which reads its initial state from props) as the child; pair with
 * `useEntityForm` inside that form.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  recordId,
  children,
}: FormDialogProps) {
  const formKey = open ? `${recordId ?? "new"}-open` : "closed";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="contents" key={formKey}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add components/ui/form-dialog.tsx components/ui/form-dialog.test.tsx
git commit -m "feat(ui): FormDialog shell with state-reset remount"
```

---

## Phase 2 — Cost fields + form-dialog migrations

### Task 6: `<InlineCostFields>`

**Files:**
- Create: `components/trip/inline-cost-fields.tsx`
- Test: `components/trip/inline-cost-fields.test.tsx`

**Interfaces:**
- Consumes: `Field` (`@/components/ui/field`), `MoneyInput` (`@/components/ui/money-input`), `Input` (`@/components/ui/input`), `CURRENCY_CODES` (`@/lib/currencies`), `FieldErrors` (`@/lib/action-result`).
- Produces:
```ts
interface InlineCostFieldsProps {
  hasMultipleCosts: boolean;      // when true, render nothing (CostEditor is authoritative)
  estimatedAmount: string;
  onEstimatedChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  actualAmount: string;
  onActualChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
}
function InlineCostFields(props: InlineCostFieldsProps): React.ReactElement | null;
```

Extracts the estimated/actual/paid block duplicated verbatim in `transport-form-dialog.tsx` (481–532), `accommodation-form-dialog.tsx` (382–433), `item-form-dialog.tsx` (521–572): render nothing when `hasMultipleCosts`; else Estimated (MoneyInput) + — only when estimated is non-empty — Actual (MoneyInput) + Date paid (date input).

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/inline-cost-fields.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineCostFields } from "./inline-cost-fields";

const base = {
  hasMultipleCosts: false,
  estimatedAmount: "",
  onEstimatedChange: vi.fn(),
  currency: "AUD",
  onCurrencyChange: vi.fn(),
  actualAmount: "",
  onActualChange: vi.fn(),
  paidAt: "",
  onPaidAtChange: vi.fn(),
  errors: {},
};

describe("InlineCostFields", () => {
  it("renders nothing when multiple costs exist", () => {
    const { container } = render(<InlineCostFields {...base} hasMultipleCosts />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the estimated field but hides actual/paid until an estimate is entered", () => {
    const { rerender } = render(<InlineCostFields {...base} />);
    expect(screen.getByText("Estimated cost")).toBeInTheDocument();
    expect(screen.queryByText("Actual cost")).not.toBeInTheDocument();

    rerender(<InlineCostFields {...base} estimatedAmount="12.50" />);
    expect(screen.getByText("Actual cost")).toBeInTheDocument();
    expect(screen.getByText("Date paid")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found).**

Run: `npx vitest run components/trip/inline-cost-fields.test.tsx`

- [ ] **Step 3: Write the implementation** (copy the block from `transport-form-dialog.tsx` 481–532 verbatim, parameterised by props)

```tsx
// components/trip/inline-cost-fields.tsx
"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CURRENCY_CODES } from "@/lib/currencies";
import type { FieldErrors } from "@/lib/action-result";

export interface InlineCostFieldsProps {
  /** When true the CostEditor is authoritative — render nothing here. */
  hasMultipleCosts: boolean;
  estimatedAmount: string;
  onEstimatedChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  actualAmount: string;
  onActualChange: (v: string) => void;
  paidAt: string;
  onPaidAtChange: (v: string) => void;
  errors: FieldErrors;
  disabled?: boolean;
}

/**
 * The inline single-cost editor (estimated + actual + date-paid) shared by the
 * transport / accommodation / item form dialogs. Actual + paid only appear once
 * an estimate is entered. Hidden entirely when >1 costs exist.
 */
export function InlineCostFields({
  hasMultipleCosts,
  estimatedAmount,
  onEstimatedChange,
  currency,
  onCurrencyChange,
  actualAmount,
  onActualChange,
  paidAt,
  onPaidAtChange,
  errors,
  disabled,
}: InlineCostFieldsProps): React.ReactElement | null {
  if (hasMultipleCosts) return null;
  return (
    <>
      <Field label="Estimated cost" error={errors.estimatedMinor?.[0]}>
        <MoneyInput
          amount={estimatedAmount}
          currency={currency}
          currencies={CURRENCY_CODES}
          onAmountChange={onEstimatedChange}
          onCurrencyChange={onCurrencyChange}
          disabled={disabled}
          invalid={Boolean(errors.estimatedMinor)}
          aria-label="Estimated cost amount"
        />
      </Field>

      {estimatedAmount.trim() && (
        <>
          <Field
            label="Actual cost"
            description="Leave blank if you haven't paid yet"
            error={errors.actualMinor?.[0]}
          >
            <MoneyInput
              amount={actualAmount}
              currency={currency}
              currencies={CURRENCY_CODES}
              onAmountChange={onActualChange}
              onCurrencyChange={onCurrencyChange}
              disabled={disabled}
              invalid={Boolean(errors.actualMinor)}
              aria-label="Actual cost amount"
            />
          </Field>

          <Field
            label="Date paid"
            description="Optional — when the cost was paid"
            error={errors.paidAt?.[0]}
          >
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => onPaidAtChange(e.target.value)}
              disabled={disabled}
            />
          </Field>
        </>
      )}
    </>
  );
}
```

> **Note:** `CURRENCY_CODES` from `@/lib/currencies` is a readonly tuple; `MoneyInput`'s `currencies` prop currently receives `CURRENCIES.map(c => c.code)` in some forms. Confirm `MoneyInput`'s prop type accepts `readonly string[]`; if not, spread to `[...CURRENCY_CODES]`. Read `components/ui/money-input.tsx` before implementing.

- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add components/trip/inline-cost-fields.tsx components/trip/inline-cost-fields.test.tsx
git commit -m "feat(trip): InlineCostFields extracted from form dialogs"
```

---

### Task 7: Migrate `stop-form-dialog.tsx` (reference implementation)

**Files:**
- Modify: `components/trip/stop-form-dialog.tsx`
- Guarded by: `components/trip/stop-form-dialog.test.tsx` (existing — do NOT edit).

**Interfaces:**
- Consumes: `FormDialog` (Task 5), `useEntityForm` (Task 4).

This is the **canonical example** the other form migrations follow. The change is purely internal — props, exported names, and behaviour are unchanged.

**Transformation:**
1. Replace the outer `StopFormDialog` Dialog wrapper with `<FormDialog>`:
```tsx
return (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title={stop ? `Edit ${stop.name}` : "Add a stop"}
    recordId={stop?.id ?? null}
  >
    <StopForm
      tripId={tripId}
      stop={stop}
      chapters={chapters}
      onClose={() => onOpenChange(false)}
      onSaved={onSaved}
      tripStartDate={tripStartDate}
      tripEndDate={tripEndDate}
      defaultArriveDate={defaultArriveDate}
      defaultDepartDate={defaultDepartDate}
      forkId={forkId}
    />
  </FormDialog>
);
```
   Delete the local `formKey` computation and the `key={formKey}` on `<StopForm>` — `FormDialog` now owns the remount. Delete the now-unused `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` imports (keep `DialogFooter`/`DialogClose` — the footer stays inside `StopForm`).

2. Inside `StopForm`, replace the `errors`/`isPending`/`handleSubmit` trio with `useEntityForm`:
```tsx
const { errors, isPending, onSubmit } = useEntityForm({
  submit: () => {
    let input: StopInput;
    if (mode === "rough") { /* …unchanged input build… */ } else { /* …unchanged… */ }
    return isEdit && stop
      ? updateStop(stop.id, input)
      : createStop(tripId, input, forkId ?? undefined);
  },
  onClose,
  onSaved,
});
```
   Delete the local `const [errors, setErrors] = …`, `const [isPending, startTransition] = …`, and `handleSubmit`. Change the form to `<form onSubmit={onSubmit} …>`. Everything else (fields, `errors.x?.[0]`, `disabled={isPending}`, `loading={isPending}`) is unchanged.

- [ ] **Step 1: Apply the transformation.**
- [ ] **Step 2: Run the existing test — expect PASS (behaviour unchanged).**

Run: `npx vitest run components/trip/stop-form-dialog.test.tsx`

- [ ] **Step 3: Lint + commit**

```bash
git add components/trip/stop-form-dialog.tsx
git commit -m "refactor(trip): migrate stop-form-dialog onto FormDialog + useEntityForm"
```

---

### Task 8: Migrate `transport-form-dialog.tsx`

**Files:** Modify `components/trip/transport-form-dialog.tsx`; guarded by its existing test.
**Interfaces:** Consumes `FormDialog`, `useEntityForm`, `InlineCostFields` (Task 6).

Same transformation as Task 7, PLUS: replace the inline estimated/actual/paid JSX block (481–532) with `<InlineCostFields hasMultipleCosts={hasMultipleCosts} estimatedAmount={estimatedAmount} onEstimatedChange={setEstimatedAmount} currency={currency} onCurrencyChange={setCurrency} actualAmount={actualAmount} onActualChange={setActualAmount} paidAt={paidAt} onPaidAtChange={setPaidAt} errors={errors} disabled={isPending} />`. Keep the `singleCost`/`hasMultipleCosts`/prefill logic and the `estimatedMinor`/`actualMinor` derivation inside `submit`. Keep `AddTransportButton`/`EditTransportButton` exactly as-is (their local `open` useState stays — see Task 21 Tier-C note on trigger buttons).

- [ ] **Step 1: Apply.** Delete now-unused `MoneyInput`/`CURRENCIES`/`formatMinor` imports only if no longer referenced.
- [ ] **Step 2: Run existing test — expect PASS.** `npx vitest run components/trip/transport-form-dialog.test.tsx`
- [ ] **Step 3: Commit** — `git commit -m "refactor(trip): migrate transport-form-dialog onto shared form primitives"`

---

### Task 9: Migrate `accommodation-form-dialog.tsx`

**Files:** Modify `components/trip/accommodation-form-dialog.tsx`; guarded by its existing test.
**Interfaces:** Consumes `FormDialog`, `useEntityForm`, `InlineCostFields`.

Same as Task 8 (form shell + `useEntityForm` + `InlineCostFields` for the 382–433 block). Keep the check-in/out soft-warning badges inline (Tier C — logged, not extracted). Keep `AddAccommodationButton`/`EditAccommodationButton` as-is.

- [ ] Apply → `npx vitest run components/trip/accommodation-form-dialog.test.tsx` (PASS) → commit `"refactor(trip): migrate accommodation-form-dialog onto shared form primitives"`.

---

### Task 10: Migrate `item-form-dialog.tsx`

**Files:** Modify `components/trip/item-form-dialog.tsx`; guarded by its existing test.
**Interfaces:** Consumes `FormDialog`, `useEntityForm`, `InlineCostFields`.

Same as Task 8 (form shell + `useEntityForm` + `InlineCostFields` for the 521–572 block). Keep `AddItemButton`/`EditItemButton` as-is.

- [ ] Apply → `npx vitest run components/trip/item-form-dialog.test.tsx` (PASS) → commit `"refactor(trip): migrate item-form-dialog onto shared form primitives"`.

---

### Task 11: Migrate `chapter-form-dialog.tsx`

**Files:** Modify `components/trip/chapter-form-dialog.tsx`; guarded by its existing test (if present — else add a minimal render test).
**Interfaces:** Consumes `FormDialog`, `useEntityForm`.

Form shell + `useEntityForm` only (no cost fields). `submit` dispatches `createChapter`/`updateChapter`.

- [ ] Apply → run the file's test (or `npm test` scoped) → commit `"refactor(trip): migrate chapter-form-dialog onto shared form primitives"`.

---

### Task 12: Migrate `schedule-item-dialog.tsx`

**Files:** Modify `components/trip/schedule-item-dialog.tsx`; guarded by its existing test.
**Interfaces:** Consumes `FormDialog`, `useEntityForm`.

Form shell + `useEntityForm` (single action `scheduleItem` — `submit` calls it; `isEdit` is effectively false). Preserve the `placedItemId` handling if the caller reads it (route via `onSaved`).

- [ ] Apply → `npx vitest run components/trip/schedule-item-dialog.test.tsx` (PASS) → commit `"refactor(trip): migrate schedule-item-dialog onto shared form primitives"`.

---

### Task 13: Migrate `components/globe/marker-form.tsx`

**Files:** Modify `components/globe/marker-form.tsx`; guarded by its existing test (if present).
**Interfaces:** Consumes `useEntityForm` (and `FormDialog` if it's dialog-shaped — read the file first; marker-form may be an inline form, in which case use `useEntityForm` only).

Replace the `create/update/deleteMarker` `startTransition` + error trio with `useEntityForm` (create/update) and, for delete, `useServerAction` directly. Marker actions return `GlobeActionResult` which surfaces form errors under `_` — the existing `FormError`/`errors._` display keeps working unchanged.

- [ ] Apply → run its test → commit `"refactor(globe): migrate marker-form onto shared form primitives"`.

---

## Phase 3 — Cross-cutting primitives + migrations

### Task 14: `<RowActions>` + migrate 6 sites

**Files:**
- Create: `components/ui/row-actions.tsx`, `components/ui/row-actions.test.tsx`
- Modify: `accommodation-card.tsx`, `item-card.tsx`, `stop-card.tsx`, `transport-card.tsx`, `chapters-manager.tsx`, `cost-editor.tsx` (the Pencil/Trash2 row)

**Interfaces:**
```ts
interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;    // aria-label, default "Edit"
  deleteLabel?: string;  // aria-label, default "Delete"
  disabled?: boolean;
  className?: string;
}
function RowActions(props: RowActionsProps): React.ReactElement;
```

- [ ] **Step 1: Failing test**

```tsx
// components/ui/row-actions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActions } from "./row-actions";

describe("RowActions", () => {
  it("renders only the buttons whose handlers are provided", () => {
    render(<RowActions onEdit={() => {}} />);
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
  });
  it("fires edit and delete handlers", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<RowActions onEdit={onEdit} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText("Edit"));
    await userEvent.click(screen.getByLabelText("Delete"));
    expect(onEdit).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run components/ui/row-actions.test.tsx`
- [ ] **Step 3: Implementation**

```tsx
// components/ui/row-actions.tsx
"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** The Edit (pencil) / Delete (trash) ghost icon-button pair used on cards. */
export function RowActions({
  onEdit,
  onDelete,
  editLabel = "Edit",
  deleteLabel = "Delete",
  disabled,
  className,
}: RowActionsProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onEdit}
          disabled={disabled}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={disabled}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
```

> Before migrating each card, read its current row markup. Only replace rows that match the `size-8` ghost Pencil/Trash2 shape. If a card uses a different aria-label (e.g. "Edit transport"), pass it via `editLabel`/`deleteLabel` to keep the existing accessible name — this keeps its test green. Any row that differs materially (extra buttons, different sizes) is left as-is and logged.

- [ ] **Step 4: Run new test — PASS.**
- [ ] **Step 5: Migrate the 6 sites one at a time**, running each card's existing test after (`npx vitest run components/trip/<card>.test.tsx`). Preserve exact aria-labels.
- [ ] **Step 6: Commit** — `git commit -m "feat(ui): RowActions + migrate card/row action pairs"`

---

### Task 15: `<SectionHeader>` + migrate sites

**Files:**
- Create: `components/ui/section-header.tsx`, `components/ui/section-header.test.tsx`
- Modify: `wishlist-board.tsx`, `components/globe/marker-list.tsx`, `itinerary-manager.tsx` (chapter headers), `components/trip/home/countdown-hero.tsx`

**Interfaces:**
```ts
interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: number | string;
  action?: React.ReactNode;   // right-aligned slot
  className?: string;
}
```

- [ ] **Step 1: Failing test**

```tsx
// components/ui/section-header.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders title and count", () => {
    render(<SectionHeader title="Wishlist" count={3} />);
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementation**

```tsx
// components/ui/section-header.tsx
import * as React from "react";
import { cn } from "@/lib/cn";

export interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: number | string;
  action?: React.ReactNode;
  className?: string;
}

/** Icon + heading (+ optional count) row with an optional right-aligned action. */
export function SectionHeader({ icon, title, count, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {icon}
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {count != null && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
      {action != null && <div className="ml-auto">{action}</div>}
    </div>
  );
}
```

> Migrate only headers matching this shape. Match each site's exact icon element and classes; if a site's heading uses a different tag/size, adapt via `className` or leave + log. Verify the icon `size-4 text-muted-foreground` styling is passed by the caller as the `icon` node.

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Migrate the 4 sites**, running the suite scoped to each after.
- [ ] **Step 6: Commit** — `git commit -m "feat(ui): SectionHeader + migrate section headers"`

---

### Task 16: `createMapLoader` + migrate 3 loaders

**Files:**
- Create: `components/ui/map-loader.tsx`
- Modify: `components/trip/route-map-loader.tsx`, `components/trip/wishlist-map-loader.tsx`, `components/globe/globe-map-loader.tsx`

**Interfaces:**
```ts
function createMapLoader<P extends Record<string, unknown>>(
  load: () => Promise<React.ComponentType<P>>,
): (props: P) => React.ReactElement;
```

- [ ] **Step 1: Implementation**

```tsx
// components/ui/map-loader.tsx
"use client";

import * as React from "react";
import dynamic from "next/dynamic";

/**
 * Build a client-only loader for a Leaflet map component. `next/dynamic` with
 * `ssr:false` must live in a Client Component; this factory is that boundary.
 *
 *   export const RouteMapLoader = createMapLoader<RouteMapProps>(
 *     () => import("./route-map").then((m) => m.RouteMap),
 *   );
 */
export function createMapLoader<P extends Record<string, unknown>>(
  load: () => Promise<React.ComponentType<P>>,
): (props: P) => React.ReactElement {
  const Inner = dynamic(load, { ssr: false }) as React.ComponentType<P>;
  return function MapLoader(props: P) {
    return <Inner {...props} />;
  };
}
```

- [ ] **Step 2: Migrate the 3 loaders.** Example (`route-map-loader.tsx`):

```tsx
"use client";
import { createMapLoader } from "@/components/ui/map-loader";
import type { RouteMapProps } from "./route-map";

export const RouteMapLoader = createMapLoader<RouteMapProps>(
  () => import("./route-map").then((m) => m.RouteMap),
);
```

> `RouteMapProps`/`WishlistMapProps`/`GlobeMapProps` must satisfy `Record<string, unknown>`. If a props type has non-index-compatible members and TS complains, relax the factory constraint to `<P extends object>` and cast `Inner` — confirm during implementation.

- [ ] **Step 3: Typecheck + build** (these are import-boundary files): `npm run build` must still succeed. Then run any consuming page tests.
- [ ] **Step 4: Commit** — `git commit -m "refactor: createMapLoader factory for the 3 Leaflet loaders"`

---

### Task 17: `useDeleteWithConfirm` + migrate plain delete sites

**Files:**
- Create: `components/ui/use-delete-with-confirm.ts`, `components/ui/use-delete-with-confirm.test.tsx`
- Modify: the **plain** confirm→delete sites only: `stops-manager.tsx`, `chapters-manager.tsx`, `note-thread.tsx`, and the checklist delete handler in `checklist.tsx`.

**LEAVE (logged):** `wishlist-board.tsx` and `itinerary-manager.tsx` delete handlers — they use `toastWithUndo` restore flows, not plain confirm→delete. Do not force them into this hook.

**Interfaces:**
- Consumes: `useConfirm` (`@/components/ui/confirm-dialog`), `useServerAction` (Task 3), `ConfirmOptions`, `ActionResult`.
- Produces:
```ts
function useDeleteWithConfirm<TArgs extends unknown[]>(opts: {
  action: (...args: TArgs) => Promise<ActionResult>;
  buildConfirm: (...args: TArgs) => ConfirmOptions;
  onDeleted?: (...args: TArgs) => void;
}): {
  requestDelete: (...args: TArgs) => Promise<void>;
  isPending: boolean;
  dialog: React.ReactNode;   // caller MUST render this
};
```

- [ ] **Step 1: Failing test**

```tsx
// components/ui/use-delete-with-confirm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useDeleteWithConfirm } from "./use-delete-with-confirm";

function Harness({ action }: { action: (id: string) => Promise<{ success: true } | { success: false; errors: Record<string, string[]> }> }) {
  const { requestDelete, dialog } = useDeleteWithConfirm({
    action,
    buildConfirm: (id: string) => ({ title: `Delete ${id}?`, destructive: true, confirmLabel: "Delete" }),
  });
  return (
    <>
      <button onClick={() => requestDelete("x1")}>trigger</button>
      {dialog}
    </>
  );
}

describe("useDeleteWithConfirm", () => {
  it("runs the action only after the user confirms", async () => {
    const action = vi.fn(async () => ({ success: true as const }));
    render(<Harness action={action} />);
    await userEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Delete x1?")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(action).toHaveBeenCalledWith("x1");
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implementation**

```ts
// components/ui/use-delete-with-confirm.ts
"use client";

import * as React from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { useServerAction } from "@/components/ui/use-server-action";
import type { ActionResult } from "@/lib/action-result";

/**
 * Confirm-then-delete: opens the shared confirm dialog, and only on confirm
 * runs the delete action (via useServerAction). Render the returned `dialog`.
 */
export function useDeleteWithConfirm<TArgs extends unknown[]>(opts: {
  action: (...args: TArgs) => Promise<ActionResult>;
  buildConfirm: (...args: TArgs) => ConfirmOptions;
  onDeleted?: (...args: TArgs) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  const { run, isPending } = useServerAction(opts.action, {
    onSuccess: (_result, ...args) => optsRef.current.onDeleted?.(...args),
  });

  const requestDelete = React.useCallback(
    async (...args: TArgs) => {
      const confirmed = await confirm(optsRef.current.buildConfirm(...args));
      if (!confirmed) return;
      run(...args);
    },
    [confirm, run],
  );

  return { requestDelete, isPending, dialog };
}
```

> When migrating a site: read its current handler, map the confirm copy into `buildConfirm`, render `{dialog}` where the site currently renders `useConfirm`'s dialog (several already call `useConfirm` — replace that with this hook). Keep the site's existing name-in-title copy verbatim so its test stays green.

- [ ] **Step 4: PASS.**
- [ ] **Step 5: Migrate the 4 plain sites**, running each file's existing test after.
- [ ] **Step 6: Commit** — `git commit -m "feat(ui): useDeleteWithConfirm + migrate plain delete sites"`

---

## Phase 4 — In-path fix + Tier B

### Task 18: Fix `add-from-globe-dialog` mutation (called-out fix)

**Files:** Modify `components/trip/add-from-globe-dialog.tsx`; guarded by its existing test.

**This is a deliberate, isolated fix**, not a mechanical migration: the audit found `addMarkerToWishlist` is called **outside** any `startTransition` (synchronous handler). Migrate it onto `useServerAction` (which supplies the transition) so the reference pattern doesn't enshrine the bug. Preserve the existing toast-on-error behaviour via `onError`, and the success toast/behaviour via `onSuccess`.

- [ ] **Step 1: Read the file.** Locate the `addMarkerToWishlist` handler (~line 82) and its current toast-error block (~88–92).
- [ ] **Step 2: Replace** the direct call with:
```tsx
const { run: addMarker, isPending } = useServerAction(addMarkerToWishlist, {
  onError: (errors) =>
    toast({
      title: "Couldn't add marker",
      description: errors._?.[0] ?? Object.values(errors)[0]?.[0],
      variant: "destructive",
    }),
  onSuccess: () => {/* keep existing success behaviour (e.g. toast/close) */},
});
```
   Wire the trigger button to `addMarker(markerId)` and disable it with `isPending`.
- [ ] **Step 3: Run existing test — PASS.** `npx vitest run components/trip/add-from-globe-dialog.test.tsx`
- [ ] **Step 4: Commit** — `git commit -m "fix(trip): run add-from-globe mutation inside a transition via useServerAction"`

---

### Task 19: Tier B — `<CardShell>` (attempt; log if it can't stay pure)

**Files:**
- Create (if it stays pure): `components/ui/card-shell.tsx`, `components/ui/card-shell.test.tsx`
- Modify: only the cards whose structure matches cleanly.

**Interfaces (target):**
```ts
interface CardShellProps {
  header?: React.ReactNode;   // title row incl. its own controls
  footer?: React.ReactNode;   // rendered under a border-top separator when present
  className?: string;
  children: React.ReactNode;  // body
}
```
`<CardShell>` is **pure layout only** — the rounded/border/padding container, an optional header slot, body, and an optional `border-t` footer slot. It makes **zero** assumptions about content.

**Guardrail:** If, while migrating, unifying a card requires content-specific conditionals inside `CardShell` (i.e. the shell needs to know it's a transport vs. an accommodation), STOP — that's the wrong abstraction. Leave that card, and record it in the follow-up log. Migrate only the cards that fit the pure shell (likely `accommodation-card`, `item-card`, `transport-card`; `trip-card`/`spend-so-far-card`/`weather-daylight-card`/`reminders-card` may not fit — judge per card).

- [ ] **Step 1: Write `<CardShell>` + a layout test** (container renders header/body/footer; footer only when provided).
- [ ] **Step 2: Attempt migration card-by-card**, running each card's existing test after. Abort a card the moment it needs a content-aware branch; log it.
- [ ] **Step 3: Commit** — `git commit -m "feat(ui): CardShell layout primitive + migrate matching cards"` (or, if the whole thing proves impure, skip creation and record the decision in Task 21's log with a one-line rationale).

---

### Task 20: Tier B — action revalidate/activity micro-helpers (extract-or-log)

**Files:** Create `lib/action-revalidate.ts` (only if clean); modify actions whose revalidate path-set matches exactly.

The audit found revalidate path-sets vary widely (e.g. `chapters.ts` revalidates 7 paths; `votes.ts` one). Extract a helper **only** for an exact-match path-set shared by ≥3 actions; otherwise log and move on. Do NOT build a config-object wrapper around guard+validate+revalidate — that was judged the wrong abstraction.

- [ ] **Step 1:** `grep -n "revalidatePath" server/actions/*.ts`; group by identical path-sets.
- [ ] **Step 2:** If ≥3 actions share an identical set, extract `revalidateTripViews(tripId)` with that exact set and adopt it there only. Run those files' tests. Else, record "left inline — path-sets too divergent" in the follow-up log.
- [ ] **Step 3:** Commit (or no-op with a logged decision).

---

## Phase 5 — Documentation & close-out

### Task 21: ADRs, COMPONENTS.md, ONBOARDING update, follow-up log, full verification

**Files:**
- Create: `docs/adr/0026-shared-ui-conventions.md`, `docs/adr/0027-unified-action-result.md`, `COMPONENTS.md`
- Modify: `ONBOARDING.md`

- [ ] **Step 1: ADR 0026 — shared UI conventions.** Follow the format of an existing ADR (read `docs/adr/0021-*.md`). Context: repeated form-dialog/mutation/card patterns. Decision: the primitives from this plan (`useServerAction`, `useEntityForm`, `<FormDialog>`, `<RowActions>`, `<SectionHeader>`, `<InlineCostFields>`, `createMapLoader`, `useDeleteWithConfirm`), their homes, and the tuned rule-of-three. Consequences: consistency + the when-to-extract bar.

- [ ] **Step 2: ADR 0027 — unified action result.** Context: 6 divergent result shapes. Decision: `ActionResult<TSuccess>` (generic = success-branch extension) for the mainstream family; `flattenZodErrors`/`validationResult` replace 11 local helpers. Explicitly record the LEFT outliers (`push` `ok`, `share` raw, `ai` `AiResult`, `error:string` in trips/forks/attachments) and why.

- [ ] **Step 3: `COMPONENTS.md` cookbook.** Root file. Sections: (a) catalog table — each primitive, its home, one-line purpose; (b) recipes — "Add a create/edit form" (→ `<FormDialog>` + `useEntityForm`, cite `stop-form-dialog.tsx`), "Call a server action from a client component" (→ `useServerAction`), "Delete with confirmation" (→ `useDeleteWithConfirm`), "A Leaflet map" (→ `createMapLoader`); (c) the when-to-extract rule (tuned rule-of-three) + the Tier-C "left duplicated on purpose" list = the follow-up log.

- [ ] **Step 4: Update `ONBOARDING.md`.** Rewrite the line-88 `useInlineEdit` note to point at `COMPONENTS.md` as the source of truth for the extract-when-it-hurts rule, and add a one-line pointer to the shared-primitives catalog.

- [ ] **Step 5: Full verification (evidence required).**

Run: `npm test`
Expected: entire suite PASS.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit** — `git commit -m "docs: ADRs 0026/0027, COMPONENTS.md cookbook, ONBOARDING pointer"`

---

## Self-Review Notes (planner)

- **Spec coverage:** Tier A #1–8 → Tasks 1–17. Tier B (CardShell, micro-helpers) → Tasks 19–20. In-path fix → Task 18. Docs/template deliverable → Task 21. Tier C is explicitly *not* implemented and is captured in Task 21's follow-up log. ✔
- **Trigger buttons (`Add*`/`Edit*`) and `useDisclosure`/`useFormDialog`** are Tier C — left as local `useState`, logged in Task 21. Not a task. ✔
- **Type consistency:** `ActionResult<TSuccess extends object>` used identically in Tasks 1/3/4/17. `FieldErrors` shared. `useServerAction` returns `{ run, isPending, errors, clearErrors }` consumed consistently by Tasks 4/17/18. `FormDialog` prop `recordId` used in Task 7's example. ✔
- **No test edits in migration tasks** — existing co-located tests are the regression gate; only Tasks 1/3/4/5/6/14/15/17 (and 19 if CardShell ships) add new tests. ✔
- **Open confirmations flagged inline** for the implementer: `MoneyInput.currencies` prop type (Task 6), map props index-signature (Task 16), marker-form shape (Task 13), CardShell purity (Task 19).
