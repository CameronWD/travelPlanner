# Phone dialogs that survive the keyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones, when the on-screen keyboard opens inside a Dialog or Sheet, the sheet sits on the keyboard and fills the visible area, with a compact header and the footer docked, instead of leaving a thin usable strip.

**Architecture:** One hook, `useKeyboardViewport`, turns `window.visualViewport` into `{ keyboardOpen, visibleHeight, bottomInset }`. `DialogContent` and `SheetContent` consume it below `sm`/`md`, setting inline `bottom`/`maxHeight`/`height` and `data-keyboard="open"`; header, footer, description and drag handle restyle off that attribute via a Tailwind named group. Android gets `interactiveWidget: "resizes-content"` on the root viewport.

**Tech Stack:** React 19 client components, Radix Dialog, Tailwind v4, Vitest (happy-dom/jsdom per file), Next `Viewport` export.

**Spec:** `docs/specs/2026-10-11-phone-keyboard-sheets.md`

## Global Constraints

- Branch: `feat/activity-history-and-audit-seed-2026-10-11`. Never commit to `main`. Never push or deploy. Never run `feedback:*`, `mcp:token` or `db:*` scripts.
- **Phone only.** Desktop (`sm+` for Dialog, `md+` for the `docked` Sheet; `right`/`left` Sheets) render byte-identical classes and no inline keyboard styles. Assert it.
- `keyboardOpen` threshold: visible height more than **120 px** shorter than `window.innerHeight`.
- No `visualViewport` (SSR, old browsers, tests that don't stub it) ⇒ keyboard closed ⇒ today's behaviour exactly.
- Listeners: `visualViewport` `resize` and `scroll`, rAF-throttled, removed on unmount. Only subscribed while a Dialog/Sheet content is mounted (the hook lives in the content components).
- Existing dialog/sheet tests stay green without edits to their assertions (they don't stub `visualViewport`, so they exercise the closed path).
- Read `node_modules/next/dist/docs/` for the `Viewport` type before adding `interactiveWidget` (this repo's Next has breaking changes).
- Verification tiers: inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never the full suite or `next build` per task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. Keyboard closes (or the dialog closes while it's open) ⇒ styles and `data-keyboard` revert; no stale inline `bottom` left on a reopened dialog — Task 2 pins it.
2. iOS toolbar collapse/expand (visible height changes by < 120 px) must not flip to the keyboard state — Task 1 pins it.
3. Rotating the phone with the keyboard open (innerHeight and visual height both change) recomputes correctly — Task 1 pins it.
4. A phone-width window on a desktop browser (no keyboard, `visualViewport` equal to inner) shows today's sheet — Task 1/2 pin it.
5. The focused field ends up visible after the sheet resizes (re-reveal runs once after the keyboard opens) — Task 2 pins it.

---

### Task 1: `useKeyboardViewport` hook

**Files:**
- Create: `components/ui/use-keyboard-viewport.ts`, `components/ui/use-keyboard-viewport.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface KeyboardViewport { keyboardOpen: boolean; visibleHeight: number; bottomInset: number }
export const KEYBOARD_THRESHOLD_PX = 120;
/** Pure: derive the state from raw numbers (exported for tests and reuse). */
export function readKeyboardViewport(innerHeight: number, vv: { height: number; offsetTop: number } | null): KeyboardViewport;
/** Subscribes to window.visualViewport while `enabled`; closed state when disabled or unavailable. */
export function useKeyboardViewport(enabled?: boolean): KeyboardViewport;
```

  `readKeyboardViewport`: `vv === null` ⇒ `{ keyboardOpen: false, visibleHeight: innerHeight, bottomInset: 0 }`. Otherwise `bottomInset = Math.max(0, Math.round(innerHeight - (vv.height + vv.offsetTop)))`, `visibleHeight = Math.round(vv.height)`, `keyboardOpen = innerHeight - vv.height > KEYBOARD_THRESHOLD_PX`.

- [ ] **Step 1: Failing tests**

```ts
import { act, renderHook } from "@testing-library/react";
import { readKeyboardViewport, useKeyboardViewport, KEYBOARD_THRESHOLD_PX } from "./use-keyboard-viewport";

describe("readKeyboardViewport", () => {
  it("no visualViewport reads as closed", () => {
    expect(readKeyboardViewport(844, null)).toEqual({ keyboardOpen: false, visibleHeight: 844, bottomInset: 0 });
  });
  it("a keyboard-sized gap reads as open with the inset below the visible area", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344 });
  });
  it("Safari scrolling the visual viewport down shrinks the inset", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 100 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 244 });
  });
  it("a toolbar-sized change stays closed", () => {
    expect(readKeyboardViewport(844, { height: 844 - KEYBOARD_THRESHOLD_PX, offsetTop: 0 }).keyboardOpen).toBe(false);
  });
  it("landscape with keyboard recomputes from the new numbers", () => {
    expect(readKeyboardViewport(390, { height: 180, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 180, bottomInset: 210 });
  });
});

describe("useKeyboardViewport", () => {
  // Fake visualViewport: an EventTarget with mutable height/offsetTop, installed on window.
  function installVV(height: number, offsetTop = 0) {
    const vv = Object.assign(new EventTarget(), { height, offsetTop });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
    return vv;
  }
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
  });
  afterEach(() => { Reflect.deleteProperty(window, "visualViewport"); vi.restoreAllMocks(); });

  it("starts from the current viewport and follows resize events", () => {
    const vv = installVV(844);
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current.keyboardOpen).toBe(false);
    act(() => { vv.height = 500; vv.dispatchEvent(new Event("resize")); });
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344 });
    act(() => { vv.height = 844; vv.dispatchEvent(new Event("resize")); });
    expect(result.current.keyboardOpen).toBe(false);
  });
  it("follows scroll events (offsetTop)", ...);
  it("disabled: never subscribes and reads closed", ...);   // spy on addEventListener
  it("removes its listeners on unmount", ...);
  it("no visualViewport: closed, no throw", ...);
});
```

Write the `...` cases out fully in the same style. Run: `npx vitest run components/ui/use-keyboard-viewport.test.tsx` — FAIL.

- [ ] **Step 2: Implement**

```ts
"use client";
import * as React from "react";

export interface KeyboardViewport { keyboardOpen: boolean; visibleHeight: number; bottomInset: number }
export const KEYBOARD_THRESHOLD_PX = 120;

export function readKeyboardViewport(innerHeight: number, vv: { height: number; offsetTop: number } | null): KeyboardViewport {
  if (!vv) return { keyboardOpen: false, visibleHeight: innerHeight, bottomInset: 0 };
  return {
    keyboardOpen: innerHeight - vv.height > KEYBOARD_THRESHOLD_PX,
    visibleHeight: Math.round(vv.height),
    bottomInset: Math.max(0, Math.round(innerHeight - (vv.height + vv.offsetTop))),
  };
}

const CLOSED: KeyboardViewport = { keyboardOpen: false, visibleHeight: 0, bottomInset: 0 };

/*
 * iOS Safari overlays the on-screen keyboard: the layout viewport and dvh keep
 * their size, only window.visualViewport shrinks. Phone sheets use this to sit
 * on the keyboard instead of behind it (spec 2026-10-11-phone-keyboard-sheets).
 */
export function useKeyboardViewport(enabled = true): KeyboardViewport {
  const [state, setState] = React.useState<KeyboardViewport>(CLOSED);
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) { setState(CLOSED); return; }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readKeyboardViewport(window.innerHeight, vv);
        setState((prev) =>
          prev.keyboardOpen === next.keyboardOpen && prev.visibleHeight === next.visibleHeight && prev.bottomInset === next.bottomInset ? prev : next);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { cancelAnimationFrame(frame); vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [enabled]);
  return state;
}
```

(`CLOSED.visibleHeight` is 0 because consumers only read heights when `keyboardOpen` is true; say so in a comment. If a test runner lacks `cancelAnimationFrame`, guard it.)

- [ ] **Step 3: Run** — PASS. **Step 4:** task-done checks; commit `feat(ui): useKeyboardViewport reads the visible area above the phone keyboard`.

---

### Task 2: `DialogContent` sits on the keyboard

**Files:**
- Modify: `components/ui/dialog.tsx`
- Test: `components/ui/dialog.test.tsx`

**Interfaces:**
- Consumes: `useKeyboardViewport` (Task 1).
- Produces: on the phone layout with the keyboard open, `DialogContent`'s element has `data-keyboard="open"` and inline `style.bottom = "<bottomInset>px"`, `style.maxHeight = "<visibleHeight>px"`, and for `size="full"` also `style.height = "<visibleHeight>px"`. A named group `group/dialog` on the content element.

- [ ] **Step 1: Failing tests** (in `dialog.test.tsx`, reuse its `setMatchMedia` helper to force phone vs desktop, and the fake `visualViewport` + rAF stub from Task 1's test — copy the helper into this file or a shared `test/helpers/visual-viewport.ts` if both files use it; prefer the shared helper):

```ts
describe("phone keyboard", () => {
  it("keyboard open: sits on the keyboard, fills the visible area, marks data-keyboard", ...); // innerHeight 844, vv 500/0 → bottom 344px, maxHeight 500px, data-keyboard="open"
  it("size full: height follows the visible area too", ...);
  it("keyboard closed: no inline geometry, no data-keyboard (today's sheet)", ...);
  it("closing the keyboard reverts the styles", ...);           // Review Focus 1
  it("reopening the dialog after closing it with the keyboard open starts clean", ...);
  it("desktop (sm+) ignores the keyboard entirely", ...);        // matchMedia desktop + vv 500 → no style, no attribute
  it("compact state: header, description, drag handle and footer carry the keyboard-open classes", ...); // assert className contains the group-data variants below
  it("re-reveals the focused field once after the keyboard opens", ...); // Review Focus 5: focus an input, then open keyboard; expect body.scrollBy called (spy) when the field is under the footer
});
```

Write each with concrete numbers. Run — FAIL.

- [ ] **Step 2: Implement** in `dialog.tsx`:
  - `const isDesktop = useIsDesktopDialog();` already exists; add `const kb = useKeyboardViewport(!isDesktop);` and `const keyboard = !isDesktop && kb.keyboardOpen;`.
  - On `DialogPrimitive.Content`: add `group/dialog` to the class list; `data-keyboard={keyboard ? "open" : undefined}`; merge `style={keyboard ? { ...props.style, bottom: kb.bottomInset, maxHeight: kb.visibleHeight, ...(size === "full" ? { height: kb.visibleHeight } : {}) } : props.style}` (pull `style` out of `props` first so it isn't overwritten).
  - Drag-handle pill: add `group-data-[keyboard=open]/dialog:hidden`.
  - `DialogHeader`: add `group-data-[keyboard=open]/dialog:min-h-12` (48 px). `DialogDescription`: add `max-sm:group-data-[keyboard=open]/dialog:hidden`.
  - `DialogFooter`: while open, drop the safe-area part: add `group-data-[keyboard=open]/dialog:pb-3 group-data-[keyboard=open]/dialog:-mb-[1.375rem]` and the matching shadow variant without `env(safe-area-inset-bottom)` — and the scroll body's `pb-[calc(1.375rem+env(safe-area-inset-bottom))]` gets `group-data-[keyboard=open]/dialog:pb-[1.375rem]` so footer and body stay in step. Check the footer's negative margin and shadow maths stay consistent (comments in the file explain them); keep the desktop classes untouched.
  - Re-reveal: keep a ref to the scroll body; in an effect keyed on `keyboard`, when it turns true and `document.activeElement` is inside the body, call the existing `revealFocusedField` logic for that element (refactor it to take `(body, field)` so both the focus handler and the effect call it — no duplicated logic).
  - Comment the new block with the spec reference, in the file's existing comment style.

- [ ] **Step 3: Run** `npx vitest run components/ui/dialog.test.tsx components/ui/form-dialog.test.tsx components/ui/confirm-dialog.test.tsx` — PASS with existing assertions unchanged.

- [ ] **Step 4:** task-done checks (`npx vitest related --run components/ui/dialog.tsx` — this fans out to many component tests; all must pass); commit `feat(ui): phone dialogs sit on the keyboard with a compact header`.

---

### Task 3: `SheetContent` sits on the keyboard; Android viewport; docs

**Files:**
- Modify: `components/ui/sheet.tsx` (+ `sheet.test.tsx`)
- Modify: `app/layout.tsx` (`viewport`)
- Modify: `docs/mobile-pwa-checklist.md` (add the real-device keyboard check)

**Interfaces:**
- Consumes: `useKeyboardViewport` (Task 1); the shared visual-viewport test helper if Task 2 created one.

- [ ] **Step 1: Failing tests** in `sheet.test.tsx`:
  - `side="bottom"` on a phone with the keyboard open: `data-keyboard="open"`, inline `bottom`/`maxHeight`; drag handle hidden via `group-data-[keyboard=open]/sheet:hidden`; scroll body drops the safe-area bottom padding.
  - `side="docked"` below `md` with the keyboard open: same geometry. At `md+` (desktop card): no inline style, no attribute.
  - `side="right"`/`"left"`: never react.
  - keyboard closed: today's classes, no inline style.
  Use a `(min-width: 768px)` matchMedia for the docked/desktop split (the docked variant switches at `md`); bottom sheets react at any width below `sm`… check: `side="bottom"` has no desktop variant, so it reacts whenever the keyboard is open — confirm by reading where `side="bottom"` is used (it may be phone-only UI); if it is ever shown on desktop, gate it on `(max-width: 639px)` like Dialog.
  Run — FAIL.
- [ ] **Step 2: Implement** mirroring Task 2: hook enabled only for `bottom` (phone) and `docked` (below `md`); `group/sheet` + `data-keyboard`; inline geometry; handle hidden; body padding without safe-area while open.
- [ ] **Step 3: Viewport.** In `app/layout.tsx`, add `interactiveWidget: "resizes-content"` to the exported `viewport` (confirm the property name and allowed values in `node_modules/next/dist/docs/` and the `Viewport` type; if this Next version does not support it, add the equivalent `<meta name="viewport">` content through the documented route and say so in the report). Add a small test if `app/layout` has one asserting `viewport`; otherwise none.
- [ ] **Step 4: Docs.** In `docs/mobile-pwa-checklist.md`, add a "Keyboard in dialogs (2026-10-11)" check: on iPhone Safari and Android Chrome, open "Add thing to do" and "Edit day title", tap a field low in the form — the sheet should sit right on the keyboard, header slim, Save visible, the field in view; close the keyboard — sheet returns to normal; rotate with the keyboard open — still fits.
- [ ] **Step 5:** Run the sheet and dialog tests; task-done checks; commit `feat(ui): sheets sit on the keyboard; Android resizes for it`.

---

## Branch finish (main session, once)

`npm test` + `npm run build` + `npm run test:integration`, then the whole-branch review covering all three specs on this branch, then superpowers:finishing-a-development-branch. The real-device check (docs/mobile-pwa-checklist.md) is Cam's, before merge.
