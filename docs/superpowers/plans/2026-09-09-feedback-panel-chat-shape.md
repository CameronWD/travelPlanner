# Feedback Panel — Chat-Widget Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the **Feedback panel** into the familiar site chat-widget: a wide panel docked above a bottom-**right** trigger, with the page still visible and usable behind it, and a green pill marking a **Done** Feedback note.

**Architecture:** Three changes. `components/ui/sheet.tsx` gains an additive `docked` side variant and a `hideOverlay` prop (every existing caller is untouched). The Feedback panel adopts them, moves to the bottom-right, and runs non-modal. The status pill for a resolved note becomes the existing theme-aware `success` badge variant.

**Tech Stack:** Next.js 16, React 19, Radix Dialog (via `components/ui/sheet.tsx`), Tailwind 4, Vitest + Testing Library.

## Global Constraints

- Work on a dedicated branch off `main` — **never** commit to `main`, never merge, never deploy.
- Terminology contract (`CONTEXT.md` §"Feedback on the app itself"): the entity is a **Feedback note**, the surface is the **Feedback panel**. Never "Note", "Flag", "bug", "issue", "ticket", "report" or "comment" for one. The panel takes the *shape* of a chat widget but is a **log**, not a conversation — never call it a chat in code, comments or copy.
- The glossary has already been updated to say bottom-**right** and to describe the docked shape. The code must match it.
- Breakpoint discipline: the mobile tab bar (`components/trip/mobile-tab-bar.tsx`) is `md:hidden` and ~3.94rem tall, and the trigger's offset already keys off `md`. Any new clearance must use the **same `md` breakpoint**, or the 640–768px band silently overlaps.
- Baseline green before every commit: `npx vitest run && npx tsc --noEmit && npm run lint`. Starting point is **3084 passing**, tsc clean, lint 0 errors (3 pre-existing warnings in `lib/compare.test.ts` and `lib/fork-plan.test.ts` — not yours).
- Never weaken or delete an existing assertion to make a test pass.

---

### Task 1: `Sheet` gains a docked variant and an optional overlay

**Files:**
- Modify: `components/ui/sheet.tsx`
- Test: `components/ui/sheet.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<SheetContent side="docked" hideOverlay>` — a bottom-right docked panel, full-screen below `md`. `hideOverlay` suppresses the dimming backdrop; both default off so **every existing caller behaves exactly as before**.

- [ ] **Step 1: Write the failing tests**

Add to `components/ui/sheet.test.tsx`, matching however that file already renders a Sheet:

```tsx
it("renders the dimming overlay by default", () => {
  render(
    <Sheet open>
      <SheetContent>
        <SheetTitle>Default</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  expect(document.querySelector(".backdrop-blur-sm")).not.toBeNull();
});

it("omits the overlay when hideOverlay is set", () => {
  render(
    <Sheet open>
      <SheetContent hideOverlay>
        <SheetTitle>Docked</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
});

it("docks to the bottom right from md up and fills the screen below it", () => {
  render(
    <Sheet open>
      <SheetContent side="docked" hideOverlay>
        <SheetTitle>Docked</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  const panel = screen.getByRole("dialog");
  expect(panel.className).toContain("inset-0");
  expect(panel.className).toContain("md:right-4");
  expect(panel.className).toContain("md:w-[560px]");
});

it("does not show the bottom sheet's drag affordance when docked", () => {
  const { container } = render(
    <Sheet open>
      <SheetContent side="docked" hideOverlay>
        <SheetTitle>Docked</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  expect(container.querySelector(".bg-muted-foreground\\/30")).toBeNull();
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run components/ui/sheet.test.tsx`
Expected: the `hideOverlay` and `docked` tests fail; the default-overlay test already passes.

- [ ] **Step 3: Add the variant and the prop**

In `sheetVariants`, add a fourth `side`:

```ts
        docked:
          "inset-0 h-full w-full rounded-none border-0 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down " +
          "md:inset-auto md:bottom-[5.25rem] md:right-4 md:h-[min(37.5rem,calc(100vh-9rem))] md:w-[560px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border",
```

`md:bottom-[5.25rem]` clears the trigger, which occupies 1rem→3.75rem from `md` up (Task 2). Below `md` the panel is deliberately full-screen — that is what a chat widget does on a phone, and it covers the tab bar rather than fighting it.

In `SheetContentProps` add `hideOverlay?: boolean;`. In `SheetContent`, destructure it, render `{!hideOverlay ? <SheetOverlay /> : null}`, and change the drag-affordance condition from `side === "bottom"` to keep it for `"bottom"` only (it already reads `side === "bottom"`, so confirm `docked` does not get it).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/ui/sheet.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Prove no existing caller changed**

Run: `npx vitest run` and confirm every other Sheet consumer's tests still pass untouched. Then `grep -rn "SheetContent" --include="*.tsx" components app | grep -v feedback` and confirm none of them pass `side="docked"` or `hideOverlay`.

- [ ] **Step 6: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add components/ui/sheet.tsx components/ui/sheet.test.tsx
git commit -m "feat(ui): docked sheet variant with an optional overlay"
```

---

### Task 2: The Feedback panel becomes a bottom-right docked widget

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx`
- Modify: `components/ui/toast.tsx` (clearance only)
- Test: `components/feedback/feedback-launcher.test.tsx`, `components/ui/toast.test.tsx`

**Interfaces:**
- Consumes: `side="docked"`, `hideOverlay` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `components/feedback/feedback-launcher.test.tsx`:

```tsx
it("anchors the trigger to the bottom right", () => {
  render(<FeedbackLauncher />);
  const trigger = screen.getByRole("button", { name: /leave feedback/i });
  expect(trigger.className).toContain("right-4");
  expect(trigger.className).not.toContain("left-4");
});

it("opens a docked panel that leaves the page visible behind it", async () => {
  const user = userEvent.setup();
  render(<FeedbackLauncher />);
  await user.click(screen.getByRole("button", { name: /leave feedback/i }));
  const panel = await screen.findByRole("dialog");
  expect(panel.className).toContain("md:w-[560px]");
  expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: both new tests fail (trigger is `left-4`; overlay present).

- [ ] **Step 3: Move the trigger and dock the panel**

In `feedback-launcher.tsx`:
- Change the trigger's `left-4` to `right-4`. Keep every other class exactly as it is — `bottom-[calc(5rem+env(safe-area-inset-bottom))]`, `md:bottom-[calc(1rem+env(safe-area-inset-bottom))]`, `z-40`, `print:hidden` — the mobile tab-bar clearance still matters.
- Update the comment above the trigger: it currently explains that bottom-left avoids the toasts. That reason is gone; the toasts now clear the trigger instead (below). Say that.
- Make the root non-modal so the page behind stays usable: `<Sheet open={open} onOpenChange={setOpen} modal={false}>`.
- On `SheetContent`, pass `side="docked"` and `hideOverlay`, keeping the existing safe-area bottom padding.
- The log currently has `max-h-[40vh]`, which fights a fixed-height panel. Change it to grow and scroll inside the panel: replace `max-h-[40vh]` with `min-h-0 flex-1`, keeping `overflow-y-auto`.

- [ ] **Step 4: Lift the toasts clear of the trigger**

`components/ui/toast.tsx` line ~20 anchors the viewport bottom-right — the corner the trigger now occupies. Change the viewport's bottom offsets so toasts stack **above** the trigger, keeping everything else (`z-100`, `max-w-sm`, `flex-col-reverse`, `gap-2`, `p-4`) as is:

- below `md`: `pb-[calc(8.25rem+env(safe-area-inset-bottom))]` (trigger's top edge sits at 7.75rem)
- from `md` up: `md:bottom-[4.25rem] md:right-4 md:pb-4` (trigger's top edge sits at 3.75rem)

Replace the existing `sm:bottom-4 sm:right-4` and `sm:pb-4` with the `md:` equivalents above — the `md` breakpoint is required, not cosmetic: `sm` would leave the 640–768px band (tab bar still visible, trigger still at 5rem) overlapping. Keep `sm:top-auto sm:max-w-sm`.

**This shifts every toast in the app upward.** That is intended and app-wide: the trigger renders on every signed-in screen, so the clearance must be unconditional. Update any assertion in `components/ui/toast.test.tsx` that pins the old offsets, and add one that the viewport reserves clearance at the `md` breakpoint.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx components/ui/toast.test.tsx`
Expected: PASS, with all 13 pre-existing launcher tests still green — in particular the offline-queue, storage-rejection and page-label ones. If a pre-existing test breaks, fix the code, not the test.

- [ ] **Step 6: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx components/ui/toast.tsx components/ui/toast.test.tsx
git commit -m "feat(feedback): dock the panel bottom-right in the chat-widget shape"
```

---

### Task 3: A resolved Feedback note wears a green pill

**Files:**
- Modify: `components/feedback/feedback-launcher.tsx`
- Test: `components/feedback/feedback-launcher.test.tsx`

**Interfaces:**
- Consumes: the `success` variant already defined in `components/ui/badge.tsx` (theme-aware, light and dark).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

The launcher's `listFeedbackNotes` mock returns notes; add cases with `status: "DONE"` and `status: "WONTFIX"` and assert the pill each one wears. Add to `components/feedback/feedback-launcher.test.tsx`:

```tsx
it("marks a done Feedback note with a green pill and a won't-fix one without", async () => {
  listMock.mockResolvedValue({
    success: true,
    notes: [
      { ...existingNote, id: "done", body: "Fixed one", status: "DONE" },
      { ...existingNote, id: "wontfix", body: "Skipped one", status: "WONTFIX" },
    ],
  });
  const user = userEvent.setup();
  render(<FeedbackLauncher />);
  await user.click(screen.getByRole("button", { name: /leave feedback/i }));

  const done = await screen.findByText("Done");
  expect(done.className).toContain("bg-success");

  const wontFix = screen.getByText("Won't fix");
  expect(wontFix.className).not.toContain("bg-success");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx -t "green pill"`
Expected: FAIL — the Done pill currently renders `variant="muted"`.

- [ ] **Step 3: Give the badge a variant per status**

The pill is rendered around line 399 as `<Badge variant="muted">{statusLabel}</Badge>`. Make the variant follow the status: **DONE → `success`**, **WONTFIX → `muted`**. Do it beside the existing `badgeFor` helper so label and variant are derived in one place rather than two — and keep `badgeFor`'s existing fallback behaviour for an unrecognised status (raw string, muted pill) exactly as it is; it is covered by a test.

Leave the `Pending` badge on a queued note as `muted` — it is a transport state, not a resolution.

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/feedback/feedback-launcher.test.tsx`
Expected: PASS, all pre-existing tests included.

- [ ] **Step 5: Baseline and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add components/feedback/feedback-launcher.tsx components/feedback/feedback-launcher.test.tsx
git commit -m "feat(feedback): a done note wears a green pill"
```

---

## Self-review

**Spec coverage:** wide docked panel ~560px bottom-right, full-screen on phone → Tasks 1–2. Page usable behind it → Task 2 (`modal={false}` + `hideOverlay`). Trigger bottom-right → Task 2. Green pill for Done, distinct from Won't fix → Task 3. Glossary already updated.

**Placeholder scan:** none — every step carries the exact classes or the exact code.

**Type consistency:** `side="docked"` and `hideOverlay` are defined in Task 1 and consumed under those exact names in Task 2. `badgeFor` (Task 3) is the existing helper, and its fallback contract is preserved.

**Known risk:** Task 2 shifts every toast in the app upward. Deliberate and called out — the alternative is toasts landing on the trigger and on the panel's send button, which is exactly when the failure toasts fire.
